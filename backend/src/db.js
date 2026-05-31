const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const path     = require('path');
const fs       = require('fs');

const dataDir  = process.env.DATA_DIR || path.join(__dirname, '../../data');
const photoDir = path.join(dataDir, 'photos');

if (!fs.existsSync(dataDir))  fs.mkdirSync(dataDir,  { recursive: true });
if (!fs.existsSync(photoDir)) fs.mkdirSync(photoDir, { recursive: true });

const db = new Database(path.join(dataDir, 'beers.db'));

// WAL mode — better concurrent read performance
db.pragma('journal_mode = WAL');

// ── Drinks ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS beers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    brewery         TEXT,
    style           TEXT,
    abv             REAL,
    country         TEXT,
    rating          INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 10),
    comment         TEXT,
    location        TEXT,
    date_tried      TEXT    NOT NULL DEFAULT (date('now')),
    would_buy_again INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`);
// Migrations
const migrate = (sql) => { try { db.exec(sql); } catch (_) {} };
migrate(`ALTER TABLE beers ADD COLUMN category   TEXT NOT NULL DEFAULT 'Beer'`);
migrate(`ALTER TABLE beers ADD COLUMN photo_path TEXT`);
migrate(`ALTER TABLE beers ADD COLUMN created_by INTEGER`);
migrate(`CREATE INDEX IF NOT EXISTS idx_beers_created_by ON beers(created_by)`);

// ── Auth ─────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password   TEXT    NOT NULL,
    role       TEXT    NOT NULL DEFAULT 'viewer',
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('public_view','false')").run();

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid     TEXT PRIMARY KEY,
    data    TEXT NOT NULL,
    expires TEXT NOT NULL
  )
`);

// ── First-run admin ──────────────────────────────────────────────────────────
(function initAdmin() {
  if (db.prepare("SELECT 1 FROM users WHERE username = 'local_admin'").get()) return;

  const chars    = 'abcdefghjkmnpqrstuvwxyz23456789';
  const seg      = () => Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join('');
  const password = `${seg()}-${seg()}-${seg()}-${seg()}`;
  const hash     = bcrypt.hashSync(password, 12);

  db.prepare("INSERT INTO users (username, password, role) VALUES ('local_admin',?,'admin')").run(hash);

  const pwFile = path.join(dataDir, 'admin-password.txt');
  fs.writeFileSync(pwFile,
    `Username: local_admin\nPassword: ${password}\n\n` +
    `Delete this file once you have logged in and changed the password.\n`
  );

  const border = '═'.repeat(50);
  console.log(`\n╔${border}╗`);
  console.log(`║  ADMIN ACCOUNT CREATED — SAVE THIS PASSWORD      ║`);
  console.log(`║                                                  ║`);
  console.log(`║  Username : local_admin                          ║`);
  console.log(`║  Password : ${password.padEnd(38)}║`);
  console.log(`║                                                  ║`);
  console.log(`╚${border}╝\n`);
  console.log(`  Saved to: ${pwFile}\n`);
})();

module.exports = db;
module.exports.photoDir = photoDir;
