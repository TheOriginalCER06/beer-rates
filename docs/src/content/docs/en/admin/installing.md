---
title: Installing and moving from the old app
description: Set up the CT at 192.168.20.234, switch over from the old Node app and import its data.
sidebar:
  order: 1
---

The app runs as Docker Compose containers in a Proxmox CT, like BLAP:

| Service | Contents |
|---|---|
| `web` | nginx: the React app, the photos (`/media/`), and a proxy for `/graphql`, `/api`, `/admin`, `/static` to `backend`. Port `WEB_PORT` (3000). |
| `backend` | Django + GraphQL (gunicorn). Runs database migrations on start. |
| `worker` | Sends emails and push notifications, tidies up hourly. |
| `db` | PostgreSQL 18. |
| `docs`, `backup` | Optional (compose profiles). |

Photos are in the Docker volume `beer-rates_media`, the database in `beer-rates_pgdata`.

## 1. The CT

The old app already runs in **CT 213** (`beerrates` on `pve2`, 192.168.20.234: Alpine, Docker, `/opt/beer-rates`, port 3000), and NPMPlus forwards `øl.cer06.no` there. The simplest is to keep using it.

Deploys log in with a key of their own, `~/.ssh/beerrates_deploy` on your PC (`ssh-keygen -t ed25519 -N "" -C beerrates-deploy-key -f ~/.ssh/beerrates_deploy`), which `scripts/deploy.sh` uses automatically. In the CT's console (Proxmox: **pve2 → 213 → Console**):

```bash
apk add --no-cache bash openssh openssl curl git
rc-update add sshd default && rc-service sshd start
mkdir -p /root/.ssh && chmod 700 /root/.ssh
# The deploy key, only from your PC (192.168.50.88) and the VPN ranges, without port or agent forwarding:
echo 'restrict,pty,from="192.168.50.88,192.168.10.*,192.168.2.*" ssh-ed25519 AAAA… beerrates-deploy-key' >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
```

`bash` is needed by the scripts, and SSH by `scripts/deploy.sh`. To take the access away again, delete that line. Give the CT **2 GB RAM** while images are built (`npm ci` and Vite), and turn on **Options → Start at boot**, or the site stays down after a reboot of `pve2`.

:::note[A fresh Debian 13 CT instead?]
Follow BLAP's guide (Debian 13, unprivileged, `nesting` + `keyctl`, Docker from docker.com), give it the address 192.168.20.234 after shutting the old CT down, and copy the old data over as a file: on the old CT, `docker run --rm -v beer-rates_drink_data:/data -v /root:/out alpine tar czf /out/old-data.tar.gz -C /data .`, then `scp` it to the new CT and use it in step 4.
:::

## 2. Get the new code

The new version lives in the same repository, so the old checkout just needs a pull:

```bash
cd /opt/beer-rates
git pull --ff-only
cp .env.example .env
openssl rand -base64 48     # -> DJANGO_SECRET_KEY
openssl rand -hex 24        # -> POSTGRES_PASSWORD
vi .env && chmod 600 .env
```

Set at least `DJANGO_SECRET_KEY`, `POSTGRES_PASSWORD`, `DJANGO_SUPERUSER_PASSWORD` and the email login (`EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`). The domain settings for øl.cer06.no are already filled in.

## 3. Start (and switch off the old app)

```bash
scripts/update.sh
```

The first time, it deletes the old app's Sunday auto-update cron job and builds the new images while the old app keeps running. Only then does it stop and remove the old app's container (its data volume `beer-rates_drink_data` is kept) and start the new one, so the site is down for about a minute. The new app listens on port 3000 like the old one, so the reverse proxy needs no change.

## 4. Import the old data

```bash
scripts/import-old.sh --dry-run    # what would be imported
scripts/import-old.sh              # do it
```

With a file instead of the volume: `scripts/import-old.sh /root/old-data.tar.gz`.

This moves:

- **Users**, with their passwords (the old bcrypt hashes work and are upgraded at the next login), roles and active state. `local_admin` becomes a superuser. A user with the same name as `DJANGO_SUPERUSER_USERNAME` isn't overwritten.
- **Drinks**, with who added them, dates and **photos** (re-saved upright, without GPS data, with thumbnails).
- **Settings**: public viewing and the online database switches.

It can be run again: what was imported before is skipped. When everything looks right, the old volume can be deleted with `docker volume rm beer-rates_drink_data`.

## 5. Check

- `https://øl.cer06.no` shows the drinks; log in as `local_admin` (old password) or the new admin.
- **Manage → Settings**: public viewing, sign-up and approval are as you want them.
- `docker compose ps`: everything `healthy`.

## Domain and HTTPS

`øl.cer06.no` (`xn--l-4ga.cer06.no`) is already in Nginx Proxy Manager, forwarding to `192.168.20.234:3000`. The proxy must pass `Host` and `X-Forwarded-Proto: https` (NPM does by default), and allow uploads of at least 16 MB (NPM: *Advanced* → `client_max_body_size 16m;` if photo uploads fail with 413).

## Docs on the same CT (optional)

In `.env`: `COMPOSE_PROFILES=docs`, `DOCS_PORT=3001` and `DOCS_ADMIN_PASSWORD=<12+ characters>`. Run `scripts/update.sh`, then add `docs.øl.cer06.no` → `192.168.20.234:3001` in NPM.
