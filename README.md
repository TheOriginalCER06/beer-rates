# Drikke Vurderinger

Self-hosted app for logging and rating beer, wine, cocktails and more – with photos, barcodes, statistics and a calendar. Website, installable web app and Android/iOS app from one codebase. Runs on a Proxmox CT with Docker Compose, the same way as BLAP.

- **App:** <https://øl.cer06.no> (`xn--l-4ga.cer06.no`), CT `192.168.20.234`, port 3000
- **Docs:** `docs/` (Norwegian + English; admin pages are password-protected), optionally served by the app at øl.cer06.no/docs
- **Changes:** [CHANGELOG.md](CHANGELOG.md). The version is in `backend/pyproject.toml` and shown in the app footer.

## Features

- **Photos that work on phones:** native camera and gallery in the app (file input with camera on the web), one-pass EXIF rotation, **crop it yourself** (drag, pinch, 4:5 / 1:1 / 3:4 / 9:16 / whole, rotate), blur/darkness warning, shrunk to ~300 kB before upload. The server re-saves every photo (strips GPS) and makes a thumbnail.
- **Barcode scanning:** ML Kit scanner in the Android app, BarcodeDetector or a self-hosted zxing-wasm polyfill elsewhere (also from a photo, or typed). Looks the code up in Open Food Facts and shows earlier drinks with the same code.
- **Label reading (OCR):** tesseract.js on the device with English + Norwegian data, served from the site (no CDN). Text becomes tap-to-use suggestions and a database search, rather than being trusted blindly.
- **Online databases:** Open Food Facts, OpenBreweryDB, TheCocktailDB, Vivino; cached 30 days, each switchable by admins.
- **Offline:** last-seen data stays visible; drinks and photos saved without a connection wait in an on-device queue (IndexedDB) and upload by themselves; a client id makes retries safe. The form keeps a draft if Android kills the app during a photo.
- **Accounts:** self sign-up (on/off), admin approval (on/off), default role, roles admin/contributor/viewer, **public viewing (on by default)**, password reset by email (Domeneshop SMTP).
- **Social:** see everyone's drinks, filter by person, 🍻 cheers, "who logs most" statistics.
- **Push notifications:** Web Push (browsers, iPhone home-screen app) and Firebase for the Android app: cheers, others' new drinks, new sign-ups (admins).
- Stats (per person and year), calendar, CSV/XLSX export (share sheet in the app), Norwegian and English UI, light/dark.

## Architecture

```
                     ┌────────────── Docker Compose (Proxmox CT 192.168.20.234) ─────────────┐
 browser/app ► :3000 ┤ web (nginx) ── React SPA (Vite + Apollo + Mantine), /media/ photos    │
                     │     │ /graphql /api /admin /static                                    │
                     │     ▼                                                                 │
                     │ backend (Django + Strawberry GraphQL, gunicorn) ─┐                    │
                     │ worker  (manage.py run_worker: email, push)  ────┼─► db (Postgres 18) │
                     │ docs (nginx, optional)   backup (optional)       │                    │
                     └──────────────────────────────────────────────────┴────────────────────┘
 Android/iOS app (Capacitor, bundled frontend) ──HTTPS + bearer token──► øl.cer06.no
```

| Path | What |
|---|---|
| `backend/accounts/` | `User` (role, approval, language, push settings), `ApiToken` + bearer middleware for the apps, rate limits |
| `backend/drinks/` | `Drink`, `Cheers`, `SiteSettings`, photos (`photos.py`), look-ups (`lookup.py`), stats, export, `import_beerrates` |
| `backend/notifications/` | Email outbox, Web Push + FCM, the worker |
| `backend/api/` | GraphQL schema, admin fields, error codes |
| `frontend/src/` | React app; `lib/` has the platform layer (web vs app), photo/crop, barcode, OCR, offline queue, push |
| `frontend/android/`, `frontend/ios/` | Capacitor projects |
| `docs/` | Astro Starlight docs, admin pages encrypted with StatiCrypt |
| `scripts/` | `deploy.sh`, `update.sh`, `import-old.sh`, `backup-loop.sh` |

## Deploying

Full guide: docs → *Administration → Installing and moving from the old app*. In short, on the CT:

```bash
cd /opt/beer-rates && git pull --ff-only
cp .env.example .env && vi .env && chmod 600 .env   # secrets, email; domain is filled in
scripts/update.sh                                   # stops the old Node app, builds, starts
scripts/import-old.sh                               # moves users (with passwords), drinks, photos, settings
```

Afterwards, from your PC: `scripts/deploy.sh` (push + `update.sh` over SSH to `root@192.168.20.234`).

## Phone apps

GitHub Actions builds the Android APK on every push (*Artifacts*) and attaches it to `v*` releases. Signing key, Firebase push and iOS: docs → *Administration → Phone apps*.

## Local development

Requires Python 3.12+ and Node 22+.

```bash
# Backend (http://127.0.0.1:8000)
cd backend
python -m venv .venv && .venv/Scripts/activate        # Linux/macOS: source .venv/bin/activate
pip install -r requirements-dev.txt
# ../.env with at least DJANGO_DEBUG=true and DJANGO_CSRF_TRUSTED_ORIGINS=http://localhost:5173
# (.claude/launch.json sets both for the dev servers)
python manage.py migrate && python manage.py createsuperuser
python manage.py runserver
python manage.py run_worker        # separate terminal; sends emails/pushes

# Frontend (http://localhost:5173, proxies API calls and /media to :8000)
cd frontend && npm install && npm run dev
```

**Checks** (CI runs all of these, plus `docker compose build` and the Android build):

```bash
cd backend && python manage.py test && ruff check . && ruff format --check .
cd frontend && npm run lint && npm run build
cd docs && npm run build
```
