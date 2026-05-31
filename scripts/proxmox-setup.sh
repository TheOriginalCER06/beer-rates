#!/bin/sh

set -eu

REPO_URL="${REPO_URL:-}"
APP_DIR="${APP_DIR:-/opt/beer-rates}"
BRANCH="${BRANCH:-main}"

log() {
  printf "\n[%s] %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
  printf "\nERROR: %s\n" "$*" >&2
  exit 1
}

usage() {
  cat <<EOF
Beer Rates Proxmox/LXC setup script (Alpine Linux)

Usage:
  $(basename "$0") --repo <git-url> [options]

Options:
  --repo <url>       Git repository URL (required)
  --app-dir <path>   Install directory (default: /opt/beer-rates)
  --branch <name>    Branch to deploy (default: main)
  -h, --help         Show this help

Environment overrides:
  REPO_URL, APP_DIR, BRANCH

Examples:
  $(basename "$0") --repo https://github.com/you/beer-rates.git
  $(basename "$0") --repo git@github.com:you/beer-rates.git --branch main
EOF
}

require_alpine() {
  command -v apk >/dev/null 2>&1 || die "This setup script is for Alpine Linux CTs (apk not found)."
}

ensure_openrc_service() {
  svc="$1"
  if command -v rc-update >/dev/null 2>&1; then
    rc-update add "$svc" default >/dev/null 2>&1 || true
  fi
  if command -v rc-service >/dev/null 2>&1; then
    rc-service "$svc" start >/dev/null 2>&1 || true
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo)
      [ "$#" -ge 2 ] || die "--repo requires a value"
      REPO_URL="$2"
      shift 2
      ;;
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
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

[ -n "$REPO_URL" ] || die "Missing required --repo <git-url>"

if [ "$(id -u)" -ne 0 ]; then
  die "Please run as root inside the CT (needed for package installation and service setup)."
fi

require_alpine

log "Installing prerequisites and Docker (Alpine apk)"
apk add --no-cache ca-certificates curl git docker docker-cli-compose util-linux

log "Ensuring Docker service is enabled and started"
ensure_openrc_service docker

mkdir -p "$(dirname "$APP_DIR")"

if [ -d "$APP_DIR/.git" ]; then
  log "Repository already exists at $APP_DIR — updating"
  cd "$APP_DIR"
  git fetch --prune origin
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
else
  if [ -d "$APP_DIR" ] && [ -n "$(ls -A "$APP_DIR" 2>/dev/null || true)" ]; then
    die "Target directory exists and is not empty: $APP_DIR"
  fi
  log "Cloning repository to $APP_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

[ -f "$APP_DIR/scripts/proxmox-update.sh" ] || die "Missing scripts/proxmox-update.sh in repository"
chmod +x "$APP_DIR"/scripts/*.sh 2>/dev/null || true

log "Deploying Beer Rates container"
"$APP_DIR/scripts/proxmox-update.sh" --app-dir "$APP_DIR" --branch "$BRANCH"

log "Setup complete"
printf "\nNext step (optional): install weekly auto-updates\n"
printf "  %s\n" "$APP_DIR/scripts/install-weekly-auto-update.sh --app-dir $APP_DIR --branch $BRANCH"
