const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { requireAdmin } = require('../middleware/auth');

// GET /api/settings — admin only
router.get('/', requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings WHERE key != ?').all('session_secret');
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

// Boolean settings the admin may toggle (master switch + per-provider look-ups).
const BOOL_KEYS = [
  'public_view',
  'lookup_enabled',        // master switch for all online look-ups
  'lookup_openbrewerydb',
  'lookup_thecocktaildb',
  'lookup_openfoodfacts',
  'lookup_vivino',
];

// PUT /api/settings — admin only
router.put('/', requireAdmin, (req, res) => {
  const body = req.body ?? {};
  const save = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const key of BOOL_KEYS) {
    if (typeof body[key] === 'boolean') save.run(key, body[key] ? 'true' : 'false');
  }

  const rows = db.prepare('SELECT key, value FROM settings WHERE key != ?').all('session_secret');
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

module.exports = router;
