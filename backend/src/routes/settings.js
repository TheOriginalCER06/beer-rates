const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { requireAdmin } = require('../middleware/auth');

// GET /api/settings — admin only
router.get('/', requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings WHERE key != ?').all('session_secret');
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

// PUT /api/settings — admin only
router.put('/', requireAdmin, (req, res) => {
  const { public_view } = req.body ?? {};

  if (typeof public_view === 'boolean') {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('public_view', ?)").run(
      public_view ? 'true' : 'false'
    );
  }

  const rows = db.prepare('SELECT key, value FROM settings WHERE key != ?').all('session_secret');
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

module.exports = router;
