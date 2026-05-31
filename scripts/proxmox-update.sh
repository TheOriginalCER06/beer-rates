#!/bin/sh

set -eu

APP_DIR="${APP_DIR:-/opt/beer-rates}"
BRANCH="${BRANCH:-main}"
DO_PULL=1
DO_BUILD=1

log() {
  printf "\n[%s] %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
  printf "\nERROR: %s\n" "$*" >&2
  exit 1
}

usage() {
  cat <<EOF
Beer Rates Proxmox update script

Usage:
  $(basename "$0") [options]

Options:
  --app-dir <path>   App directory containing docker-compose.yml (default: /opt/beer-rates)
  --branch <name>    Git branch to update from (default: main)
  --no-pull          Skip git fetch/pull
  --no-build         Skip image rebuild; restart with current image
  -h, --help         Show this help

Environment overrides:
  APP_DIR, BRANCH

Examples:
  $(basename "$0")
  $(basename "$0") --branch main
  $(basename "$0") --no-pull --no-build
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
    --no-pull)
      DO_PULL=0
      shift
      ;;
    --no-build)
      DO_BUILD=0
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

command -v docker >/dev/null 2>&1 || die "docker is not installed"

if docker compose version >/dev/null 2>&1; then
  COMPOSE_IMPL="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_IMPL="docker-compose"
else
  die "Neither 'docker compose' nor 'docker-compose' is available"
fi

compose_cmd() {
  if [ "$COMPOSE_IMPL" = "docker-compose" ]; then
    docker-compose "$@"
  else
    docker compose "$@"
  fi
}

[ -d "$APP_DIR" ] || die "App directory does not exist: $APP_DIR"
cd "$APP_DIR"

[ -f "docker-compose.yml" ] || [ -f "compose.yml" ] || die "No docker compose file found in $APP_DIR"

if [ "$DO_PULL" -eq 1 ]; then
  command -v git >/dev/null 2>&1 || die "git is not installed"
  [ -d ".git" ] || die "No .git directory in $APP_DIR (cannot pull updates)"

  log "Fetching latest code"
  git fetch --prune origin

  CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
    log "Switching branch: $CURRENT_BRANCH -> $BRANCH"
    git checkout "$BRANCH"
  fi

  log "Pulling origin/$BRANCH (fast-forward only)"
  git pull --ff-only origin "$BRANCH"
fi

if [ "$DO_BUILD" -eq 1 ]; then
  log "Rebuilding and restarting containers"
  compose_cmd up -d --build --remove-orphans
else
  log "Restarting containers without rebuild"
  compose_cmd up -d --remove-orphans
fi

log "Current container status"
compose_cmd ps

log "Update completed successfully"
