#!/bin/sh

set -eu

APP_DIR="${APP_DIR:-/opt/beer-rates}"
BRANCH="${BRANCH:-main}"
SKIP_OS_UPGRADE=0

log() {
  printf "[%s] %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
  printf "ERROR: %s\n" "$*" >&2
  exit 1
}

usage() {
  cat <<EOF
Beer Rates weekly maintenance script (Alpine Linux)

Usage:
  $(basename "$0") [options]

Options:
  --app-dir <path>     App directory (default: /opt/beer-rates)
  --branch <name>      Branch to update from (default: main)
  --skip-os-upgrade    Skip apk update/upgrade for the CT
  -h, --help           Show this help

Environment overrides:
  APP_DIR, BRANCH
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --app-dir)
      [ "$#" -ge 2 ] || die "--app-dir requires a value"
      APP_DIR="$2"
      shift 2
      ;;
    --branch)
      [ "$#" -ge 2 ] || die "--branch requires a value"
      BRANCH="$2"
      shift 2
      ;;
    --skip-os-upgrade)
      SKIP_OS_UPGRADE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  die "Please run as root (required for CT package upgrades)."
fi

command -v apk >/dev/null 2>&1 || die "This script is Alpine-only (apk not found)."

[ -d "$APP_DIR" ] || die "App directory does not exist: $APP_DIR"
[ -f "$APP_DIR/scripts/proxmox-update.sh" ] || die "Missing update script: $APP_DIR/scripts/proxmox-update.sh"

# Prevent overlapping runs
LOCK_FILE="/var/lock/beerrates-weekly-auto-update.lock"
mkdir -p "$(dirname "$LOCK_FILE")"
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    log "Another weekly update is already running. Exiting."
    exit 0
  fi
else
  LOCK_DIR="${LOCK_FILE}.d"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    log "Another weekly update is already running. Exiting."
    exit 0
  fi
  trap 'rmdir "$LOCK_DIR" >/dev/null 2>&1 || true' EXIT
fi

if [ "$SKIP_OS_UPGRADE" -eq 0 ]; then
  log "Updating CT packages (apk update + upgrade)"
  apk update
  apk upgrade --available
  apk cache clean || true
fi

log "Updating Beer Rates deployment"
"$APP_DIR/scripts/proxmox-update.sh" --app-dir "$APP_DIR" --branch "$BRANCH"

log "Weekly maintenance completed"
