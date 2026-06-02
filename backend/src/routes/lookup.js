const express = require('express');
const router  = express.Router();
const rateLimit = require('express-rate-limit');
const { search, providerStatus } = require('../lookup');
const { requireLogin } = require('../middleware/auth');

// Modest limiter — look-ups are cached, but guard against accidental hammering.
const lookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /api/lookup/providers — which external sources are active
router.get('/providers', (_req, res) => res.json(providerStatus()));

// GET /api/lookup?category=Beer&q=guinness
router.get('/', requireLogin, lookupLimiter, async (req, res) => {
  const { category = '', q = '' } = req.query;
  try {
    const results = await search(category, String(q));
    res.json({ category, query: String(q), results });
  } catch (e) {
    console.error('lookup error:', e);
    res.status(502).json({ error: 'Look-up failed', results: [] });
  }
});

module.exports = router;
