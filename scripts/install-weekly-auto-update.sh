#!/usr/bin/env bash

set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/beer-rates}"
BRANCH="${BRANCH:-main}"
CRON_EXPR="${CRON_EXPR:-30 4 * * 0}"
LOG_FILE="${LOG_FILE:-/var/log/beerrates-weekly-update.log}"
MARKER="# beerrates-weekly-auto-update"

log() {
  printf "\n[%s] %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
  printf "\nERROR: %s\n" "$*" >&2
  exit 1
}

usage() {
  cat <<EOF
Install Beer Rates weekly auto-update cron job (Alpine Linux)

Usage:
  $(basename "$0") [options]

Options:
  --app-dir <path>   App directory (default: /opt/beer-rates)
  --branch <name>    Branch to update from (default: main)
  --cron <expr>      Cron schedule (default: "30 4 * * 0" = Sundays 04:30)
  --log-file <path>  Log file path (default: /var/log/beerrates-weekly-update.log)
  -h, --help         Show this help

Environment overrides:
  APP_DIR, BRANCH, CRON_EXPR, LOG_FILE

Examples:
  $(basename "$0")
  $(basename "$0") --cron "0 3 * * 6"
  $(basename "$0") --app-dir /opt/beer-rates --branch main
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
    --cron)
      [[ $# -ge 2 ]] || die "--cron requires a value"
      CRON_EXPR="$2"
      shift 2
      ;;
    --log-file)
      [[ $# -ge 2 ]] || die "--log-file requires a value"
      LOG_FILE="$2"
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

if [[ "$EUID" -ne 0 ]]; then
  die "Please run as root (required for cron installation and CT upgrades)."
fi

command -v apk >/dev/null 2>&1 || die "This installer is Alpine-only (apk not found)."

[[ -d "$APP_DIR" ]] || die "App directory does not exist: $APP_DIR"
[[ -f "$APP_DIR/scripts/weekly-auto-update.sh" ]] || die "Missing script: $APP_DIR/scripts/weekly-auto-update.sh"

chmod +x "$APP_DIR/scripts/weekly-auto-update.sh" "$APP_DIR/scripts/proxmox-update.sh" || true

if ! command -v crontab >/dev/null 2>&1; then
  log "Installing cron tools"
  apk add --no-cache dcron
fi

if ! command -v crontab >/dev/null 2>&1; then
  die "crontab is still unavailable after installing dcron"
fi

if command -v rc-update >/dev/null 2>&1; then
  rc-update add crond default >/dev/null 2>&1 || true
fi
if command -v rc-service >/dev/null 2>&1; then
  rc-service crond start >/dev/null 2>&1 || true
fi

mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"

CRON_CMD="APP_DIR=\"$APP_DIR\" BRANCH=\"$BRANCH\" \"$APP_DIR/scripts/weekly-auto-update.sh\" >> \"$LOG_FILE\" 2>&1"
CRON_LINE="$CRON_EXPR $CRON_CMD $MARKER"

TMP_CRON="$(mktemp)"
(crontab -l 2>/dev/null || true) | grep -v "beerrates-weekly-auto-update" > "$TMP_CRON" || true
printf "%s\n" "$CRON_LINE" >> "$TMP_CRON"
crontab "$TMP_CRON"
rm -f "$TMP_CRON"

log "Weekly auto-update cron job installed"
printf "Schedule : %s\n" "$CRON_EXPR"
printf "Command  : %s\n" "$CRON_CMD"
printf "Log file : %s\n" "$LOG_FILE"

log "Current cron entries"
crontab -l
