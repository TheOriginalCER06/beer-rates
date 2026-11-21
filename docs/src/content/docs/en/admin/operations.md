---
title: Updates, backups and troubleshooting
description: deploy.sh and update.sh, backups and restore, logs, and common problems.
sidebar:
  order: 3
---

## Updating

From your PC, in the repository (the same way as BLAP):

```bash
scripts/deploy.sh
```

It pushes the current branch, then runs `scripts/update.sh` on the CT over SSH (`root@192.168.20.234`, or `DEPLOY_TARGET`). `update.sh` (also runnable on the CT itself):

1. backs up the database and `.env` to `/opt/backup` (skip with `--no-backup`),
2. `git pull --ff-only`, and prints the CHANGELOG entries since the installed version,
3. builds the images one at a time and restarts with `docker compose up -d --wait`. Migrations run on start.

**Making a release:** bump `version` in `backend/pyproject.toml` (and `frontend/package.json`, `docs/package.json`), add a `## [x.y.z] - date` section at the top of `CHANGELOG.md`, commit, tag `vX.Y.Z`, push. The tag also builds the Android APK for the release.

## Backups

- Before every update: database and `.env` (see above).
- Nightly (optional): add `backup` to `COMPOSE_PROFILES` in `.env`. Every night at `BACKUP_TIME` it saves a database dump and `.env` (keeps 14) and a copy of the photos (keeps 3) in `BACKUP_DIR`. One right away: `docker compose run --rm backup --now`.

Copy `/opt/backup` off the CT now and then (or back up the whole CT in Proxmox).

### Restore

```bash
cd /opt/beer-rates
docker compose stop backend worker web
gunzip -c /opt/backup/nightly-2026-11-20.sql.gz | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE \"$POSTGRES_DB\"" -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\"" && psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
# Photos:
docker run --rm -v beer-rates_media:/media -v /opt/backup:/b alpine sh -c 'rm -rf /media/* && tar -xf /b/media-2026-11-20.tar -C /media'
docker compose up -d
```

## Logs and admin

```bash
docker compose ps
docker compose logs -f backend worker web
docker compose exec backend python manage.py createsuperuser
```

The Django admin is at `/admin/` (admins only) for anything the app's **Manage** page doesn't cover: app logins (delete one to log a phone out), rate limits (delete one to lift a lockout), the email outbox.

## Troubleshooting

| Problem | Fix |
|---|---|
| Login fails with a CSRF error | The proxy must pass `Host` and `X-Forwarded-Proto: https`; `DJANGO_CSRF_TRUSTED_ORIGINS` must be `https://xn--l-4ga.cer06.no`. |
| Photo upload fails (413) | Raise the proxy's upload limit to 16 MB (NPM → *Advanced* → `client_max_body_size 16m;`). |
| The app says "No connection to the server" | Check the server address on the login screen (must be HTTPS), and that the site opens in the phone's browser. |
| Emails don't arrive | `docker compose logs worker`; check `EMAIL_HOST_USER` (the Domeneshop mailbox username) and that `DEFAULT_FROM_EMAIL` is on that mailbox. |
| "Background worker: not running" in Manage | `docker compose logs worker`, then `docker compose up -d worker`. |
| 502 Bad Gateway right after an update | Wait for `backend` to be healthy (`docker compose ps`); it runs migrations first. |
| Build stops with "killed" | The CT ran out of memory during `npm ci`/Vite: give it 2 GB RAM. |
