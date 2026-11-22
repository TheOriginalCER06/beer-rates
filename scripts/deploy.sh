#!/usr/bin/env bash
# Push the current branch to GitHub, then update the CT over SSH (runs scripts/update.sh there).
#
#   scripts/deploy.sh [user@host] [update.sh options, e.g. --no-backup]
#
# The target defaults to $DEPLOY_TARGET, then root@192.168.20.234 (CT 213 on pve2). It logs in with
# the CT's own deploy key, ~/.ssh/beerrates_deploy ($DEPLOY_KEY), and only that key, so ssh never
# falls back to another key. Without that file, ssh uses its normal keys.
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${DEPLOY_TARGET:-root@192.168.20.234}"
if [ $# -gt 0 ] && [[ "$1" != --* ]]; then TARGET="$1"; shift; fi
KEY="${DEPLOY_KEY:-$HOME/.ssh/beerrates_deploy}"
SSH_OPTS=()
if [ -f "$KEY" ]; then SSH_OPTS=(-i "$KEY" -o IdentitiesOnly=yes -o IdentityAgent=none); fi

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "Uncommitted changes. Commit them first:" >&2
    git status --short --untracked-files=no >&2
    exit 1
fi

echo "==> Pushing $(git rev-parse --abbrev-ref HEAD) (v$(sed -n 's/^version = "\(.*\)"$/\1/p' backend/pyproject.toml))"
git push

echo "==> Updating $TARGET"
ssh "${SSH_OPTS[@]}" -t "$TARGET" "cd /opt/beer-rates && scripts/update.sh $*"
