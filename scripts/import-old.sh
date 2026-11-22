#!/usr/bin/env bash
# Import users, drinks, photos and settings from the old Node.js Beer Rates.
#
#   scripts/import-old.sh                       # from the old Docker volume (beer-rates_drink_data)
#   scripts/import-old.sh /root/old-data.tar.gz # or from a backup of the old /app/data folder
#   scripts/import-old.sh <volume or file> --dry-run   # show what would happen, change nothing
#
# Safe to run again: drinks and users imported before are skipped. Run it after the new stack
# is up (scripts/update.sh), from the repository on the CT.
set -euo pipefail
cd "$(dirname "$0")/.."

SOURCE="${1:-beer-rates_drink_data}"
[ $# -gt 0 ] && shift

if [ -f "$SOURCE" ]; then
    file="$(cd "$(dirname "$SOURCE")" && pwd)/$(basename "$SOURCE")"
    mount=(-v "$file:/import/$(basename "$file"):ro")
    target="/import/$(basename "$file")"
elif docker volume inspect "$SOURCE" >/dev/null 2>&1; then
    mount=(-v "$SOURCE:/import:ro")
    target="/import"
else
    echo "Neither a file nor a Docker volume: $SOURCE" >&2
    echo "Volumes: $(docker volume ls -q | tr '\n' ' ')" >&2
    exit 1
fi

echo "==> Importing from $SOURCE"
docker compose run --rm "${mount[@]}" backend python manage.py import_beerrates "$target" "$@"
