const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();
const db      = require('../db');
const photoDir = db.photoDir;
const { requireLogin } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB ceiling (browser compresses before sending)
  fileFilter: (_, file, cb) =>
    cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)),
});

const VALID_SORTS  = ['created_at', 'date_tried', 'rating', 'name', 'brewery', 'category'];
const VALID_ORDERS = ['asc', 'desc'];

const canCreateDrinks = (req) => ['admin', 'contributor'].includes(req.session?.role);
const canManageDrink = (req, drink) => {
  if (req.session?.role === 'admin') return true;
  if (req.session?.role !== 'contributor') return false;
  return Number(drink.created_by) === Number(req.session?.userId);
};

// GET /api/drinks
router.get('/', (req, res) => {
  const { search, style, category, minRating, maxRating,
          sort = 'created_at', order = 'desc' } = req.query;
  const col = VALID_SORTS.includes(sort)   ? sort  : 'created_at';
  const dir = VALID_ORDERS.includes(order) ? order : 'desc';

  let q = 'SELECT * FROM beers WHERE 1=1';
  const p = [];
  if (search)    { q += ' AND (name LIKE ? OR brewery LIKE ? OR comment LIKE ?)'; p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (category)  { q += ' AND category = ?'; p.push(category); }
  if (style)     { q += ' AND style = ?';    p.push(style); }
  if (minRating) { q += ' AND rating >= ?';  p.push(parseInt(minRating, 10)); }
  if (maxRating) { q += ' AND rating <= ?';  p.push(parseInt(maxRating, 10)); }
  q += ` ORDER BY ${col} ${dir}`;

  res.json(db.prepare(q).all(...p));
});

// GET /api/drinks/stats
router.get('/stats', (_, res) => {
  const total = db.prepare('SELECT COUNT(*) AS n FROM beers').get().n;
  if (!total) return res.json({ total: 0 });

  const avg         = db.prepare('SELECT AVG(rating) AS a FROM beers').get().a;
  const wouldBuy    = db.prepare('SELECT COUNT(*) AS n FROM beers WHERE would_buy_again=1').get().n;
  const ratingDist  = db.prepare('SELECT rating, COUNT(*) AS count FROM beers GROUP BY rating ORDER BY rating').all();
  const byCategory  = db.prepare(`SELECT category, COUNT(*) AS count, ROUND(AVG(rating),1) AS avgRating FROM beers GROUP BY category ORDER BY count DESC`).all();
  const topStyles   = db.prepare(`SELECT style, COUNT(*) AS count, ROUND(AVG(rating),1) AS avgRating FROM beers WHERE style IS NOT NULL AND style != '' GROUP BY style ORDER BY count DESC LIMIT 10`).all();
  const topCountries= db.prepare(`SELECT country, COUNT(*) AS count, ROUND(AVG(rating),1) AS avgRating FROM beers WHERE country IS NOT NULL AND country != '' GROUP BY country ORDER BY count DESC LIMIT 10`).all();
  const topDrinks   = db.prepare('SELECT * FROM beers ORDER BY rating DESC, created_at DESC LIMIT 5').all();

  res.json({ total, avgRating: Math.round(avg * 10) / 10,
    wouldBuyAgainPct: Math.round((wouldBuy / total) * 100),
    ratingDistribution: ratingDist, byCategory, topStyles, topCountries, topDrinks });
});

// GET /api/drinks/calendar
router.get('/calendar', (req, res) => {
  const year  = parseInt(req.query.year,  10) || new Date().getFullYear();
  const month = parseInt(req.query.month, 10) || (new Date().getMonth() + 1);
  const pad   = (n) => String(n).padStart(2, '0');
  const from  = `${year}-${pad(month)}-01`;
  const to    = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;
  const rows  = db.prepare('SELECT * FROM beers WHERE date_tried >= ? AND date_tried <= ? ORDER BY date_tried, created_at').all(from, to);
  const out   = {};
  for (const r of rows) { if (!out[r.date_tried]) out[r.date_tried] = []; out[r.date_tried].push(r); }
  res.json(out);
});

// GET /api/drinks/:id
router.get('/:id', (req, res) => {
  const d = db.prepare('SELECT * FROM beers WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json(d);
});

// POST /api/drinks
router.post('/', requireLogin, (req, res) => {
  if (!canCreateDrinks(req)) return res.status(403).json({ error: 'Forbidden' });

  const { name, brewery, style, abv, country, category, rating, comment, location, date_tried, would_buy_again } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const r = parseInt(rating, 10);
  if (!r || r < 1 || r > 10) return res.status(400).json({ error: 'Rating must be 1–10' });

  const result = db.prepare(`
    INSERT INTO beers (name,brewery,style,abv,country,category,rating,comment,location,date_tried,would_buy_again,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(name.trim(), brewery?.trim()||null, style||null, abv?parseFloat(abv):null,
    country?.trim()||null, category||'Beer', r, comment?.trim()||null,
    location?.trim()||null, date_tried||new Date().toISOString().split('T')[0], would_buy_again?1:0, req.session.userId);

  res.status(201).json(db.prepare('SELECT * FROM beers WHERE id=?').get(result.lastInsertRowid));
});

// PUT /api/drinks/:id
router.put('/:id', requireLogin, (req, res) => {
  const existing = db.prepare('SELECT * FROM beers WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!canManageDrink(req, existing)) return res.status(403).json({ error: 'Forbidden' });

  const { name, brewery, style, abv, country, category, rating, comment, location, date_tried, would_buy_again } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const r = parseInt(rating, 10);
  if (!r || r < 1 || r > 10) return res.status(400).json({ error: 'Rating must be 1–10' });

  db.prepare(`UPDATE beers SET name=?,brewery=?,style=?,abv=?,country=?,category=?,rating=?,comment=?,location=?,date_tried=?,would_buy_again=? WHERE id=?`)
    .run(name.trim(), brewery?.trim()||null, style||null, abv?parseFloat(abv):null,
      country?.trim()||null, category||existing.category||'Beer', r,
      comment?.trim()||null, location?.trim()||null,
      date_tried||existing.date_tried, would_buy_again?1:0, req.params.id);

  res.json(db.prepare('SELECT * FROM beers WHERE id=?').get(req.params.id));
});

// DELETE /api/drinks/:id
router.delete('/:id', requireLogin, (req, res) => {
  const existing = db.prepare('SELECT * FROM beers WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!canManageDrink(req, existing)) return res.status(403).json({ error: 'Forbidden' });

  // Remove photo if exists
  if (existing.photo_path) {
    const p = path.join(photoDir, path.basename(existing.photo_path));
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  db.prepare('DELETE FROM beers WHERE id=?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// POST /api/drinks/:id/photo
router.post('/:id/photo', requireLogin, upload.single('photo'), (req, res) => {
  const existing = db.prepare('SELECT * FROM beers WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!canManageDrink(req, existing)) return res.status(403).json({ error: 'Forbidden' });
  if (!req.file)  return res.status(400).json({ error: 'No image file' });

  // Remove old photo
  if (existing.photo_path) {
    const old = path.join(photoDir, path.basename(existing.photo_path));
    if (fs.existsSync(old)) fs.unlinkSync(old);
  }

  // Save new photo as {id}.jpg
  const filename = `${req.params.id}.jpg`;
  fs.writeFileSync(path.join(photoDir, filename), req.file.buffer);
  db.prepare('UPDATE beers SET photo_path=? WHERE id=?').run(`/photos/${filename}`, req.params.id);

  res.json({ photo_path: `/photos/${filename}` });
});

// DELETE /api/drinks/:id/photo
router.delete('/:id/photo', requireLogin, (req, res) => {
  const existing = db.prepare('SELECT * FROM beers WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!canManageDrink(req, existing)) return res.status(403).json({ error: 'Forbidden' });
  if (existing.photo_path) {
    const p = path.join(photoDir, path.basename(existing.photo_path));
    if (fs.existsSync(p)) fs.unlinkSync(p);
    db.prepare('UPDATE beers SET photo_path=NULL WHERE id=?').run(req.params.id);
  }
  res.json({ message: 'Photo removed' });
});

module.exports = router;
