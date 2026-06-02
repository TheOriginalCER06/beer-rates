const express   = require('express');
const path      = require('path');
const crypto    = require('crypto');
const session   = require('express-session');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const fs        = require('fs');
const db        = require('./db');
const photoDir  = db.photoDir;
const drinksRouter   = require('./routes/drinks');
const authRouter     = require('./routes/auth');
const settingsRouter = require('./routes/settings');
const lookupRouter   = require('./routes/lookup');
const { requireView, requireLogin } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';

// Trust the first reverse proxy (Nginx on Proxmox) so X-Forwarded-Proto is respected
// and secure cookies work when COOKIE_SECURE=true is set
app.set('trust proxy', 1);

// ── Security headers ─────────────────────────────────────────────────────────
// CDN origins used by the optional on-device AI detection (TensorFlow.js model
// weights + Tesseract.js OCR worker/WASM/training data). Only fetched when the
// user enables "Automatic drink detection"; the browser pulls them directly.
const AI_MODEL_HOSTS = [
  'https://storage.googleapis.com',      // coco-ssd model weights
  'https://cdn.jsdelivr.net',            // tesseract.js worker + core wasm
  'https://tessdata.projectnaftali.com', // tesseract language training data
  'https://unpkg.com',                   // fallback CDN
];
// Google Fonts (Inter) loaded by index.html
const FONT_HOSTS   = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
// Cloudflare web-analytics beacon (injected when served behind Cloudflare)
const CF_HOSTS     = ['https://static.cloudflareinsights.com', 'https://cloudflareinsights.com'];
// Remote thumbnail hosts shown in drink-lookup search results
const LOOKUP_IMG_HOSTS = [
  'https://www.thecocktaildb.com',
  'https://images.openfoodfacts.org',
  'https://images.vivino.com',
];
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      // 'wasm-unsafe-eval' lets the WebAssembly backends (TF/Tesseract) instantiate;
      // blob: + jsDelivr let the Tesseract worker script load.
      scriptSrc:     ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", "blob:", 'https://cdn.jsdelivr.net', ...CF_HOSTS],
      styleSrc:      ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      imgSrc:        ["'self'", "data:", "blob:", ...LOOKUP_IMG_HOSTS],
      connectSrc:    ["'self'", "data:", "blob:", ...AI_MODEL_HOSTS, ...CF_HOSTS],
      workerSrc:     ["'self'", "blob:"],
      fontSrc:       ["'self'", ...FONT_HOSTS],
      objectSrc:     ["'none'"],
      frameAncestors:["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.disable('x-powered-by');

// ── Body parsing — explicit UTF-8 ─────────────────────────────────────────────
app.use((req, _res, next) => {
  // Force charset=utf-8 on JSON requests so accented characters (ø, æ, å, é …) parse correctly
  const ct = req.headers['content-type'] || '';
  if (ct.includes('application/json') && !ct.includes('charset'))
    req.headers['content-type'] = ct + '; charset=utf-8';
  next();
});
app.use(express.json({ limit: '2mb' }));

// ── Session ───────────────────────────────────────────────────────────────────
const sessionSecret = (() => {
  let row = db.prepare("SELECT value FROM settings WHERE key='session_secret'").get();
  if (!row) {
    const s = crypto.randomBytes(32).toString('hex');
    db.prepare("INSERT INTO settings (key,value) VALUES ('session_secret',?)").run(s);
    row = { value: s };
  }
  return row.value;
})();

class SQLiteStore extends session.Store {
  get(sid, cb) {
    try {
      const r = db.prepare("SELECT data,expires FROM sessions WHERE sid=?").get(sid);
      if (!r || new Date(r.expires) < new Date()) {
        if (r) db.prepare("DELETE FROM sessions WHERE sid=?").run(sid);
        return cb(null, null);
      }
      cb(null, JSON.parse(r.data));
    } catch (e) { cb(e); }
  }
  set(sid, sess, cb) {
    try {
      const exp = new Date(Date.now() + (sess.cookie?.maxAge ?? 86_400_000)).toISOString();
      db.prepare("INSERT OR REPLACE INTO sessions (sid,data,expires) VALUES (?,?,?)")
        .run(sid, JSON.stringify(sess), exp);
      cb(null);
    } catch (e) { cb(e); }
  }
  destroy(sid, cb) {
    try { db.prepare("DELETE FROM sessions WHERE sid=?").run(sid); cb(null); } catch (e) { cb(e); }
  }
}
setInterval(() => db.prepare("DELETE FROM sessions WHERE expires < datetime('now')").run(), 3_600_000);

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore(),
  name: 'sid',
  cookie: {
    maxAge:   7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'strict',
    secure:   process.env.COOKIE_SECURE === 'true',
  },
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many login attempts — try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);

// ── Photo serving (auth-aware) ────────────────────────────────────────────────
const publicViewEnabled = () =>
  db.prepare("SELECT value FROM settings WHERE key='public_view'").get()?.value === 'true';

app.get('/photos/:filename', (req, res) => {
  if (!req.session?.userId && !publicViewEnabled())
    return res.status(401).end();

  const filename = path.basename(req.params.filename); // strip any path traversal
  const filePath = path.resolve(photoDir, filename);

  // Ensure resolved path is inside photoDir (double-check)
  if (!filePath.startsWith(path.resolve(photoDir) + path.sep) &&
      filePath !== path.resolve(photoDir))
    return res.status(403).end();

  if (!fs.existsSync(filePath)) return res.status(404).end();

  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.sendFile(filePath);
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',     authRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/lookup',   lookupRouter);
app.use('/api/drinks', (req, res, next) =>
  req.method === 'GET' ? requireView(req, res, next) : requireLogin(req, res, next),
  drinksRouter
);

// ── SPA static files ─────────────────────────────────────────────────────────
if (PROD) {
  const staticPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(staticPath, { index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(staticPath, 'index.html')));
}

app.listen(PORT, '0.0.0.0', () =>
  console.log(`Drink Tracker running on http://0.0.0.0:${PORT}`)
);
