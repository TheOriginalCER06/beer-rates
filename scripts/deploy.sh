#!/usr/bin/env bash
# Push the current branch to GitHub, then update the CT over SSH (runs scripts/update.sh there).
#
#   scripts/deploy.sh [user@host] [update.sh options, e.g. --no-backup]
#
# The target defaults to $DEPLOY_TARGET, then root@192.168.20.234. Needs SSH key access to the CT.
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${DEPLOY_TARGET:-root@192.168.20.234}"
if [ $# -gt 0 ] && [[ "$1" != --* ]]; then TARGET="$1"; shift; fi

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "Uncommitted changes. Commit them first:" >&2
    git status --short --untracked-files=no >&2
    exit 1
fi

echo "==> Pushing $(git rev-parse --abbrev-ref HEAD) (v$(sed -n 's/^version = "\(.*\)"$/\1/p' backend/pyproject.toml))"
git push

echo "==> Updating $TARGET"
ssh -t "$TARGET" "cd /opt/beer-rates && scripts/update.sh $*"
