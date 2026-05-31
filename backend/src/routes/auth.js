const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();
const db      = require('../db');
const { requireLogin, requireAdmin } = require('../middleware/auth');
const VALID_ROLES = ['admin', 'viewer', 'contributor'];

// GET /api/auth/config — public
router.get('/config', (_req, res) => {
  const pv = db.prepare("SELECT value FROM settings WHERE key='public_view'").get()?.value === 'true';
  res.json({ publicView: pv });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not logged in' });
  const u = db.prepare('SELECT id,username,role FROM users WHERE id=? AND active=1').get(req.session.userId);
  if (!u) { req.session.destroy(() => {}); return res.status(401).json({ error: 'Not logged in' }); }
  res.json(u);
});

// POST /api/auth/login  (rate-limited in server.js)
router.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(username);
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: 'Invalid username or password' });

  req.session.userId = user.id;
  req.session.role   = user.role;
  res.json({ id: user.id, username: user.username, role: user.role });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out' }));
});

// POST /api/auth/change-password  (own password)
router.post('/change-password', requireLogin, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword)  return res.status(400).json({ error: 'Both fields required' });
  if (newPassword.length < 8)            return res.status(400).json({ error: 'Min 8 characters' });

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId);
  if (!user || !(await bcrypt.compare(currentPassword, user.password)))
    return res.status(401).json({ error: 'Current password is wrong' });

  db.prepare('UPDATE users SET password=? WHERE id=?').run(await bcrypt.hash(newPassword, 12), user.id);
  res.json({ message: 'Password changed' });
});

// ── User management (admin only) ─────────────────────────────────────────────

// GET /api/auth/users
router.get('/users', requireAdmin, (_req, res) => {
  res.json(db.prepare('SELECT id,username,role,active,created_at FROM users ORDER BY id').all());
});

// POST /api/auth/users  — create user
router.post('/users', requireAdmin, async (req, res) => {
  const { username, password, role = 'viewer' } = req.body ?? {};
  if (!username?.trim()) return res.status(400).json({ error: 'Username required' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password min 8 chars' });
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Role must be admin, contributor or viewer' });

  const exists = db.prepare('SELECT 1 FROM users WHERE username=?').get(username.trim());
  if (exists) return res.status(409).json({ error: 'Username already taken' });

  const hash = await bcrypt.hash(password, 12);
  const result = db.prepare('INSERT INTO users (username,password,role) VALUES (?,?,?)').run(username.trim(), hash, role);
  const u = db.prepare('SELECT id,username,role,active,created_at FROM users WHERE id=?').get(result.lastInsertRowid);
  res.status(201).json(u);
});

// PUT /api/auth/users/:id  — update role or active status
router.put('/users/:id', requireAdmin, (req, res) => {
  const { role, active } = req.body ?? {};
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });

  // Protect local_admin from demotion or deactivation
  if (u.username === 'local_admin') {
    if (role && role !== 'admin')  return res.status(403).json({ error: 'Cannot change local_admin role' });
    if (active === false || active === 0) return res.status(403).json({ error: 'Cannot deactivate local_admin' });
  }

  const newRole   = VALID_ROLES.includes(role) ? role : u.role;
  const newActive = active !== undefined ? (active ? 1 : 0) : u.active;

  db.prepare('UPDATE users SET role=?, active=? WHERE id=?').run(newRole, newActive, req.params.id);
  res.json(db.prepare('SELECT id,username,role,active,created_at FROM users WHERE id=?').get(req.params.id));
});

// POST /api/auth/users/:id/reset-password  — admin sets new password
router.post('/users/:id/reset-password', requireAdmin, async (req, res) => {
  const { newPassword } = req.body ?? {};
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Min 8 characters' });
  const u = db.prepare('SELECT 1 FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE users SET password=? WHERE id=?').run(await bcrypt.hash(newPassword, 12), req.params.id);
  res.json({ message: 'Password reset' });
});

// DELETE /api/auth/users/:id
router.delete('/users/:id', requireAdmin, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (u.username === 'local_admin') return res.status(403).json({ error: 'Cannot delete local_admin' });

  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ message: 'User deleted' });
});

module.exports = router;
