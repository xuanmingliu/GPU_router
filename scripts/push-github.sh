#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REMOTE_URL="https://xuanmingliu@github.com/xuanmingliu/GPU_router.git"
BRANCH="main"

if [ ! -d .git ]; then
  git init
  git branch -M "$BRANCH"
fi

git branch -M "$BRANCH"
git remote add origin "$REMOTE_URL" 2>/dev/null || git remote set-url origin "$REMOTE_URL"

git credential reject <<EOF 2>/dev/null || true
protocol=https
host=github.com
username=Brandon-Liu-Jx
EOF

git credential reject <<EOF 2>/dev/null || true
protocol=https
host=github.com
username=xuanmingliu
EOF

echo "Remote:"
git remote -v
echo

git add .

if ! git diff --cached --quiet; then
  DEFAULT_MESSAGE="Update GPU router platform"
  read -r -p "Commit message [${DEFAULT_MESSAGE}]: " MESSAGE
  MESSAGE="${MESSAGE:-$DEFAULT_MESSAGE}"
  git commit -m "$MESSAGE"
else
  echo "No new changes to commit."
fi

echo
echo "Pushing to GitHub..."
echo "If prompted for Password, paste your GitHub Personal Access Token."
echo

GIT_TERMINAL_PROMPT=1 git push -u origin "$BRANCH"
