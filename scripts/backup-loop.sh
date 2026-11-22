#!/bin/sh
# Nightly backups, run by the optional `backup` service in docker-compose.yml (turn it on with
# COMPOSE_PROFILES=backup). Runs inside the postgres image.
#
#   At BACKUP_TIME (default 03:00, TZ Europe/Oslo) every day:
#     /backups/nightly-YYYY-MM-DD.sql.gz   pg_dump of the database, gzipped
#     /backups/nightly-env-YYYY-MM-DD      copy of .env, mode 600
#     /backups/media-YYYY-MM-DD.tar        the photos (JPEGs don't compress, so no gzip)
#   keeping the newest BACKUP_KEEP (default 14) dumps and BACKUP_MEDIA_KEEP (default 3) photo copies.
#
#   docker compose run --rm backup --now    makes one backup right away and exits.
set -eu
set -o pipefail

TIME="${BACKUP_TIME:-03:00}"
KEEP="${BACKUP_KEEP:-14}"
MEDIA_KEEP="${BACKUP_MEDIA_KEEP:-3}"
DIR=/backups
export PGPASSWORD="$POSTGRES_PASSWORD"

log() { echo "$(date '+%F %T') $*"; }

prune() {
    # Newest first; everything after the first N goes.
    ls -1t "$DIR"/nightly-*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
    ls -1t "$DIR"/nightly-env-* 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
    ls -1t "$DIR"/media-*.tar 2>/dev/null | tail -n +"$((MEDIA_KEEP + 1))" | xargs -r rm -f
}

backup() {
    stamp="$(date +%F)"
    tmp="$DIR/.nightly-$stamp.sql.gz.tmp"
    if ! pg_dump -h db -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip >"$tmp"; then
        rm -f "$tmp"
        log "Backup FAILED (see the error above)"
        return 1
    fi
    mv "$tmp" "$DIR/nightly-$stamp.sql.gz"
    if [ -f /config/.env ]; then
        cp /config/.env "$DIR/nightly-env-$stamp"
        chmod 600 "$DIR/nightly-env-$stamp"
    fi
    if [ -d /media ]; then
        tar -cf "$DIR/.media-$stamp.tar.tmp" -C /media . && mv "$DIR/.media-$stamp.tar.tmp" "$DIR/media-$stamp.tar"
    fi
    prune
    log "Saved nightly-$stamp.sql.gz ($(du -h "$DIR/nightly-$stamp.sql.gz" | cut -f1)) and media-$stamp.tar ($(du -h "$DIR/media-$stamp.tar" 2>/dev/null | cut -f1))"
}

mkdir -p "$DIR"
if [ "${1:-}" = "--now" ]; then
    backup
    exit
fi

log "Nightly backups at $TIME to $DIR, keeping $KEEP dumps and $MEDIA_KEEP photo copies"
last=""
while true; do
    today="$(date +%F)"
    if [ "$(date +%H:%M)" = "$TIME" ] && [ "$last" != "$today" ]; then
        backup || true
        last="$today"
    fi
    sleep 20
done
