# Beer Rates

A personal drink-tracking web app. Log beers, wines, cocktails, and more with ratings, tasting notes, and photos. Runs as a single Docker container — designed for self-hosting on a Proxmox LXC or any Linux server.

Note: This project is made with AI! The code is made using Claude Sonnet 4.6. Do not use for production without understanding the risks!
---

## Features

| | |
|---|---|
| **Drink categories** | Beer, Wine, Cocktail, Alcohol Free, Other — each with a tailored style dropdown |
| **Entry fields** | Name, brewery/producer, style, ABV, country/region, rating (1–10), tasting notes, location/occasion, date, photo, "would have again" |
| **Photo upload** | Camera or file picker; images are compressed client-side (Canvas API) before upload |
| **Calendar view** | Monthly grid with coloured dots per category; click any day to see that day's drinks |
| **Stats page** | Average rating, by-category breakdown, rating distribution, top drinks, styles, countries |
| **Authentication** | Session-based login; admin can toggle public read-only access for guests |
| **User management** | Admin can create, edit, activate/deactivate, and delete users; role system (admin / contributor / viewer) |
| **Dark UI** | Material UI v5 with a custom dark theme; responsive — works on phone and desktop |
| **Security** | `helmet`, rate-limited login (15 req / 15 min), strict session cookies, path-traversal protection, hidden `X-Powered-By` |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 · Vite · Material UI v5 · Emotion |
| Backend | Node.js 20 · Express 4 |
| Database | SQLite via `better-sqlite3` (single file, no separate server) |
| Auth | `express-session` with a custom SQLite session store · `bcryptjs` |
| File uploads | `multer` (memory storage) · Canvas API compression |
| Security | `helmet` · `express-rate-limit` |
| Container | Docker — multi-stage build (Node 20 Alpine) |

---

## Quick start

```bash
git clone <your-repo-url> beer-rates
cd beer-rates
docker compose up -d --build
```

The app is now running on **port 3000**.

### Get the admin password

On first start the admin account (`local_admin`) is created with a random password. Retrieve it:

```bash
# From Docker logs (one-time output on first boot)
docker compose logs | grep "Password :"

# Or read the file saved in the data volume
docker exec beerrates-app-1 cat /app/data/admin-password.txt
```

> Delete `/app/data/admin-password.txt` after you have saved the password and changed it.

---

## Deploying to Proxmox LXC

### Recommended setup

```
Proxmox LXC (Alpine Linux)
  └── Docker
        └── beerrates container  :3000
  └── Nginx  (reverse proxy, SSL termination)  :443 → :3000
```

### 1. Create the LXC and install Docker (Alpine)

```bash
# Inside the LXC container
apk add --no-cache docker docker-cli-compose git curl ca-certificates
rc-update add docker default
rc-service docker start
```

### 2. Clone and start the app

```bash
git clone <your-repo-url> /opt/beer-rates
cd /opt/beer-rates
docker compose up -d --build
```

### 3. Set up Nginx with HTTPS

Install Nginx and obtain a certificate (e.g. with Certbot or a wildcard cert from your router/reverse proxy).

```nginx
server {
    listen 443 ssl;
    server_name beer.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/beer.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/beer.yourdomain.com/privkey.pem;

    # Increase limit for photo uploads
    client_max_body_size 25M;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

### 4. Enable secure cookies

Once HTTPS is in place, uncomment the `COOKIE_SECURE` line in `docker-compose.yml`:

```yaml
environment:
  - NODE_ENV=production
  - PORT=3000
  - COOKIE_SECURE=true   # ← uncomment this
```

Then restart:

```bash
docker compose up -d
```

> **Why is this needed?** `COOKIE_SECURE=true` tells Express to set the `Secure` flag on session cookies so they are only sent over HTTPS. Express also needs the `trust proxy` setting (already enabled) to accept `X-Forwarded-Proto: https` from Nginx.

---

## Proxmox setup script (fresh CT)

For a first-time install inside a new Proxmox LXC container, use:

`scripts/proxmox-setup.sh`

This script will:

- install Alpine prerequisites (`curl`, `git`, Docker, Compose plugin),
- clone your repository to `/opt/beer-rates` (or custom path),
- deploy/redeploy the app using `scripts/proxmox-update.sh`.

### Example

```bash
chmod +x scripts/proxmox-setup.sh
./scripts/proxmox-setup.sh --repo https://github.com/TheOriginalCER06/beer-rates.git --branch main
```

---

## Useful Docker commands

```bash
# View logs (including the first-run admin password)
docker compose logs -f

# Restart the app
docker compose restart

# Rebuild after a code change
docker compose up -d --build

# Stop and remove containers (data volume is preserved)
docker compose down

# Stop and ALSO delete all data
docker compose down -v

# Health check
docker compose ps
```

---

## Proxmox one-command update script

This repository includes a script that updates code and redeploys the app on your Proxmox LXC host.

Script path:

`scripts/proxmox-update.sh`

### First-time setup on the server

```bash
cd /opt/beer-rates
chmod +x scripts/proxmox-update.sh
```

### Run update

```bash
cd /opt/beer-rates
./scripts/proxmox-update.sh
```

### Useful options

```bash
# Update from a specific branch
./scripts/proxmox-update.sh --branch main

# Restart without pulling new git commits
./scripts/proxmox-update.sh --no-pull

# Pull latest code, but skip rebuild
./scripts/proxmox-update.sh --no-build
```

The script automatically:

- verifies required tools (`docker`, compose, and `git` when pulling),
- pulls latest code with fast-forward safety,
- rebuilds and restarts containers,
- prints final container status.

---

## Weekly auto-update (CT upgrade + app update)

Use the cron installer script to run weekly maintenance automatically:

`scripts/install-weekly-auto-update.sh`

It adds a weekly cron job that runs:

`scripts/weekly-auto-update.sh`

The weekly job does both:

- upgrades the **Proxmox CT OS packages** (`apk update` + `apk upgrade` + cache cleanup),
- updates and redeploys Beer Rates via `scripts/proxmox-update.sh`.

### Install weekly cron job

```bash
cd /opt/beer-rates
chmod +x scripts/*.sh
./scripts/install-weekly-auto-update.sh --app-dir /opt/beer-rates --branch main
```

Default schedule: **Sunday 04:30** (`30 4 * * 0`).

### Custom schedule example

```bash
./scripts/install-weekly-auto-update.sh --cron "0 3 * * 6"
```

### Check logs

```bash
tail -f /var/log/beerrates-weekly-update.log
```

---

## Data backup

All data lives in the `drink_data` Docker volume. Back it up with:

```bash
docker run --rm \
  -v beer-rates_drink_data:/data \
  -v "$(pwd)":/backup \
  alpine tar czf /backup/beer-rates-backup-$(date +%Y%m%d).tar.gz /data
```

Restore:

```bash
docker run --rm \
  -v beer-rates_drink_data:/data \
  -v "$(pwd)":/backup \
  alpine tar xzf /backup/beer-rates-backup-20260601.tar.gz -C /
```

---

## Local development (no Docker)

Requires Node.js 18 or later.

**Terminal 1 — backend** (listens on port 3000):

```bash
cd backend
npm install
npm run dev        # nodemon auto-restarts on changes
```

**Terminal 2 — frontend** (Vite dev server on port 5173):

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` and `/photos` requests to the backend on port 3000.

> **Note:** In dev mode `COOKIE_SECURE` is not set, so plain HTTP sessions work fine.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the Express server listens on |
| `DATA_DIR` | `/app/data` | Directory for the SQLite database and uploaded photos |
| `NODE_ENV` | — | Set to `production` by the Dockerfile |
| `COOKIE_SECURE` | `false` | Set to `true` when the app is accessed over HTTPS |

---

## API reference

All endpoints live under `/api`.

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/auth/config` | Public | Returns `{ publicView: bool }` |
| `GET` | `/api/auth/me` | Session | Current user info |
| `POST` | `/api/auth/login` | Public | Login (rate-limited: 15 req / 15 min) |
| `POST` | `/api/auth/logout` | Session | Invalidate session |
| `POST` | `/api/auth/change-password` | Session | Change own password |
| `GET` | `/api/auth/users` | Admin | List all users |
| `POST` | `/api/auth/users` | Admin | Create user |
| `PUT` | `/api/auth/users/:id` | Admin | Update role or active status |
| `POST` | `/api/auth/users/:id/reset-password` | Admin | Admin sets new password for any user |
| `DELETE` | `/api/auth/users/:id` | Admin | Delete user (cannot delete `local_admin`) |

#### Roles

- **Admin**: full access, including user management and all drink actions.
- **Contributor**: can create drinks and can edit/delete only drinks they created.
- **Viewer**: read-only (cannot create/edit/delete drinks).

#### Permission matrix

| Action | Admin | Contributor | Viewer |
|---|---|---|---|
| Browse drinks / stats / calendar | ✅ | ✅ | ✅ |
| Create drink | ✅ | ✅ | ❌ |
| Edit own drink | ✅ | ✅ | ❌ |
| Edit others' drinks | ✅ | ❌ | ❌ |
| Delete own drink | ✅ | ✅ | ❌ |
| Delete others' drinks | ✅ | ❌ | ❌ |
| Manage users and settings | ✅ | ❌ | ❌ |

### Drinks

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/drinks` | View | List drinks |
| `GET` | `/api/drinks/stats` | View | Aggregated statistics |
| `GET` | `/api/drinks/calendar` | View | Drinks grouped by date |
| `GET` | `/api/drinks/:id` | View | Single drink |
| `POST` | `/api/drinks` | Admin / Contributor | Create drink |
| `PUT` | `/api/drinks/:id` | Owner / Admin | Update drink (contributor only for own drinks) |
| `DELETE` | `/api/drinks/:id` | Owner / Admin | Delete drink (also deletes photo; contributor only for own drinks) |
| `POST` | `/api/drinks/:id/photo` | Owner / Admin | Upload / replace photo (contributor only for own drinks) |
| `DELETE` | `/api/drinks/:id/photo` | Owner / Admin | Remove photo (contributor only for own drinks) |

**"View"** = logged in, or public view is enabled.

**"Owner / Admin"** = admin, or the contributor who originally created the drink.

#### `GET /api/drinks` query parameters

| Param | Example | Description |
|---|---|---|
| `search` | `pale` | Search name, brewery, and notes |
| `category` | `Beer` | `Beer`, `Wine`, `Cocktail`, `Alcohol Free`, `Other` |
| `style` | `Stout` | Exact style match |
| `minRating` | `7` | Minimum rating (inclusive) |
| `maxRating` | `10` | Maximum rating (inclusive) |
| `sort` | `rating` | `created_at`, `date_tried`, `rating`, `name`, `category` |
| `order` | `desc` | `asc` or `desc` |

#### `GET /api/drinks/calendar` query parameters

| Param | Example | Description |
|---|---|---|
| `year` | `2026` | Year (defaults to current) |
| `month` | `6` | Month 1–12 (defaults to current) |

Returns `{ "YYYY-MM-DD": [ ...drinks ] }`.

### Settings

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/settings` | Admin | Get all settings |
| `PUT` | `/api/settings` | Admin | Update settings (`public_view: bool`) |

### Photos

```
GET /photos/:filename
```

Auth-aware static file serving. Returns 401 if not logged in and public view is off.

---

## Project structure

```
beer-rates/
├── backend/
│   ├── src/
│   │   ├── server.js              # Express entry — sessions, security, routing
│   │   ├── db.js                  # SQLite setup, migrations, first-run admin
│   │   ├── middleware/
│   │   │   └── auth.js            # requireView / requireLogin / requireAdmin
│   │   └── routes/
│   │       ├── auth.js            # Login, logout, user management
│   │       ├── drinks.js          # CRUD + photo upload + stats + calendar
│   │       └── settings.js        # Public view toggle
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── main.jsx               # React root + MUI ThemeProvider
│   │   ├── App.jsx                # Router, auth gate, route map
│   │   ├── AuthContext.jsx        # Global auth state (user, publicView)
│   │   ├── theme.js               # MUI dark theme definition
│   │   ├── constants.js           # Categories, icons, colours, styles
│   │   ├── utils/
│   │   │   └── imageCompress.js   # Canvas-based JPEG compression
│   │   └── components/
│   │       ├── Navbar.jsx         # AppBar + mobile Drawer
│   │       ├── LoginPage.jsx      # Full-screen login (shown when public view is off)
│   │       ├── DrinkList.jsx      # List with category tabs + filters + Skeletons
│   │       ├── DrinkCard.jsx      # Card with photo, rating badge, category chip
│   │       ├── DrinkForm.jsx      # Add/Edit form with photo upload
│   │       ├── DrinkDetail.jsx    # Detail view with hero photo
│   │       ├── CalendarView.jsx   # Monthly calendar grid
│   │       ├── StatsView.jsx      # KPIs, LinearProgress bars, top lists
│   │       ├── SettingsPage.jsx   # Access control, password change, user management
│   │       ├── ConfirmDialog.jsx  # Reusable MUI confirmation dialog
│   │       ├── PasswordInput.jsx  # TextField with show/hide toggle
│   │       ├── RatingBadge.jsx    # Coloured Avatar showing 1–10 rating
│   │       └── RatingPicker.jsx   # 10 clickable circle buttons for rating input
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── Dockerfile                     # Multi-stage: Vite build → Node Alpine
├── docker-compose.yml
├── scripts/
│   ├── proxmox-setup.sh          # First-time Proxmox/LXC bootstrap + deploy helper
│   ├── proxmox-update.sh         # App update helper (git pull + compose up)
│   ├── weekly-auto-update.sh     # Weekly CT upgrade + app update runner
│   └── install-weekly-auto-update.sh # Installs weekly cron job for auto-updates
├── .dockerignore
└── .gitignore
```

---

## Database schema

The SQLite database is stored at `/app/data/beers.db` inside the container.

```sql
-- Drinks
CREATE TABLE beers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  brewery         TEXT,
  style           TEXT,
  abv             REAL,
  country         TEXT,
  category        TEXT    NOT NULL DEFAULT 'Beer',
  rating          INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 10),
  comment         TEXT,
  location        TEXT,
  date_tried      TEXT    NOT NULL DEFAULT (date('now')),
  would_buy_again INTEGER NOT NULL DEFAULT 0,
  created_by      INTEGER,
  photo_path      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Users
CREATE TABLE users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password   TEXT    NOT NULL,          -- bcrypt hash
  role       TEXT    NOT NULL DEFAULT 'viewer',  -- 'admin' | 'contributor' | 'viewer'
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Settings (key/value)
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
  -- Keys: public_view ('true'/'false'), session_secret
);

-- Sessions (express-session SQLite store)
CREATE TABLE sessions (
  sid     TEXT PRIMARY KEY,
  data    TEXT NOT NULL,
  expires TEXT NOT NULL
);
```
