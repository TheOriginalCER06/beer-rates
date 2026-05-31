#!/usr/bin/env bash

set -Eeuo pipefail

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
Beer Rates weekly maintenance script

Usage:
  $(basename "$0") [options]

Options:
  --app-dir <path>     App directory (default: /opt/beer-rates)
  --branch <name>      Branch to update from (default: main)
  --skip-os-upgrade    Skip apt update/upgrade for the CT
  -h, --help           Show this help

Environment overrides:
  APP_DIR, BRANCH
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-dir)
      [[ $# -ge 2 ]] || die "--app-dir requires a value"
      APP_DIR="$2"
      shift 2
      ;;
    --branch)
      [[ $# -ge 2 ]] || die "--branch requires a value"
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

if [[ "$EUID" -ne 0 ]]; then
  die "Please run as root (required for CT package upgrades)."
fi

[[ -d "$APP_DIR" ]] || die "App directory does not exist: $APP_DIR"
[[ -f "$APP_DIR/scripts/proxmox-update.sh" ]] || die "Missing update script: $APP_DIR/scripts/proxmox-update.sh"

# Prevent overlapping runs
LOCK_FILE="/var/lock/beerrates-weekly-auto-update.lock"
mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "Another weekly update is already running. Exiting."
  exit 0
fi

if [[ "$SKIP_OS_UPGRADE" -eq 0 ]]; then
  if command -v apt-get >/dev/null 2>&1; then
    log "Updating CT packages (apt update + dist-upgrade)"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get -y dist-upgrade
    apt-get -y autoremove
    apt-get -y autoclean
  else
    log "apt-get not found — skipping CT package upgrade"
  fi
fi

log "Updating Beer Rates deployment"
"$APP_DIR/scripts/proxmox-update.sh" --app-dir "$APP_DIR" --branch "$BRANCH"

log "Weekly maintenance completed"
