const db = require('../db');

const publicViewEnabled = () =>
  db.prepare("SELECT value FROM settings WHERE key = 'public_view'").get()?.value === 'true';

/** GET: allow if logged-in OR public view is on. POST/PUT/DELETE: requireLogin. */
function requireView(req, res, next) {
  if (req.session?.userId) return next();
  if (req.method === 'GET' && publicViewEnabled()) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

/** Always requires a valid session. */
function requireLogin(req, res, next) {
  if (req.session?.userId) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

/** Requires admin role. */
function requireAdmin(req, res, next) {
  if (req.session?.role === 'admin') return next();
  res.status(403).json({ error: 'Forbidden' });
}

module.exports = { requireView, requireLogin, requireAdmin };
