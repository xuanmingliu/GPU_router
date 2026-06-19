#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REMOTE_URL="git@github.com:xuanmingliu/GPU_router.git"
BRANCH="main"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_xuanmingliu}"

if [ ! -d .git ]; then
  git init
  git branch -M "$BRANCH"
fi

git branch -M "$BRANCH"
git remote add origin "$REMOTE_URL" 2>/dev/null || git remote set-url origin "$REMOTE_URL"

echo "Remote:"
git remote -v
echo

if [ ! -f "$SSH_KEY" ]; then
  echo "SSH key not found: $SSH_KEY" >&2
  echo "Set SSH_KEY=/path/to/key or create ~/.ssh/id_ed25519_xuanmingliu." >&2
  exit 1
fi

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
echo "Using SSH key: $SSH_KEY"
echo

GIT_SSH_COMMAND="ssh -i $SSH_KEY -o IdentitiesOnly=yes" git push -u origin "$BRANCH"
