#!/usr/bin/env bash
# Update Beer Rates on the Proxmox CT (run from anywhere in the repo).
#
#   scripts/update.sh [--no-backup]
#
#   1. Backs up the database and .env to $BACKUP_DIR (default /opt/backup).
#   2. git pull --ff-only
#   3. Prints the CHANGELOG.md entries between the old and the new version.
#   4. Rebuilds (one image at a time) and restarts with docker compose up -d --wait. Migrations run
#      on start, and the docs site is included when COMPOSE_PROFILES=docs is set in .env.
#   The first time after the old Node app it also stops that app and removes its cron job.
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP=1
for arg in "$@"; do
    case "$arg" in
        --no-backup) BACKUP=0 ;;
        -h | --help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "Unknown option: $arg (see --help)" >&2; exit 2 ;;
    esac
done

BACKUP_DIR="${BACKUP_DIR:-/opt/backup}"

version() { sed -n 's/^version = "\(.*\)"$/\1/p' backend/pyproject.toml | head -n 1; }
env_value() { sed -n "s/^$1=//p" .env | tail -n 1; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
abort() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

[ -f .env ] || abort ".env not found. Copy .env.example to .env and fill it in (see the docs: Admin → Installing)."
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    git status --short --untracked-files=no >&2
    abort "Local changes to tracked files. Commit or stash them first."
fi
mkdir -p secrets

OLD_VERSION="$(version)"
step "Installed version: ${OLD_VERSION:-old Node.js app}"

# Lists are read into a variable first: with pipefail, `docker compose … | grep -q` fails at random
# when grep quits early and compose gets SIGPIPE.
running="$(docker compose ps --status running --services 2>/dev/null || true)"
if grep -qx db <<<"$running" && [ "$BACKUP" -eq 1 ]; then
    step "Backing up the database and .env to $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
    stamp="$(date +%F-%H%M%S)-v$OLD_VERSION"
    docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip >"$BACKUP_DIR/beerrates-$stamp.sql.gz"
    install -m 600 .env "$BACKUP_DIR/env-$stamp"
    echo "Saved $BACKUP_DIR/beerrates-$stamp.sql.gz and $BACKUP_DIR/env-$stamp"
else
    echo "The database isn't running: skipping the backup."
fi

step "Pulling the latest code"
git pull --ff-only

NEW_VERSION="$(version)"
if [ "$NEW_VERSION" != "$OLD_VERSION" ]; then
    step "What's new (${OLD_VERSION:-old app} -> $NEW_VERSION)"
    # Every CHANGELOG.md section above the one for the old version.
    awk -v old="[$OLD_VERSION]" '/^## \[/ { if (old != "[]" && index($0, old)) exit; show = 1 } show' CHANGELOG.md
else
    step "Version unchanged ($NEW_VERSION)"
fi

# The old Node app had a cron job that pulled and rebuilt it every Sunday; it would fight this script.
if command -v crontab >/dev/null && crontab -l 2>/dev/null | grep -q beerrates-weekly-auto-update; then
    step "Removing the old app's auto-update cron job"
    crontab -l | grep -v beerrates-weekly-auto-update | crontab -
fi

# One image at a time: building the app and the docs in parallel (two npm installs) can
# exhaust the memory of a small CT. The site keeps running while this happens.
step "Building images"
# Ready-made images (Postgres) are downloaded now too, not after the swap below.
docker compose pull --quiet --ignore-buildable
services="$(docker compose config --services)"
for service in backend web docs; do
    if grep -qx "$service" <<<"$services"; then
        docker compose build "$service"
    fi
done

# The old Node app (service "app", port 3000) is stopped only now that the new images are built, so
# the site is down for about a minute rather than the whole build. Its data volume stays for
# scripts/import-old.sh.
old_app="$(docker ps -q --filter label=com.docker.compose.project=beer-rates --filter label=com.docker.compose.service=app)"
if [ -n "$old_app" ]; then
    step "Stopping the old Node.js app (its data stays in the volume beer-rates_drink_data)"
    docker stop "$old_app" >/dev/null
    docker rm "$old_app" >/dev/null
fi

step "Restarting"
docker compose up -d --wait --remove-orphans

step "Done"
docker compose ps
WEB_PORT="$(env_value WEB_PORT)"
curl -fsS "http://localhost:${WEB_PORT:-3000}/api/health/" && echo
