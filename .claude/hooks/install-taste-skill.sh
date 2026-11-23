#!/bin/bash
# Installs taste-skill (https://github.com/Leonxlnx/taste-skill) — the `design-taste-frontend` skill —
# at the start of every Claude Code cloud session. Cloud containers start fresh, so a global
# install does not survive between sessions. Not vendored into the repo: it carries ~40 MB of photos.
#
# - Cloud sessions only. On a laptop, install it yourself (see CLAUDE.md → taste-skill).
# - Clones only skills/taste-skill (sparse), then runs upstream's own install.sh, which symlinks
#   it into ~/.claude/skills/design-taste-frontend.
# - Points CHROME_PATH at the container's Chromium; the skill's browser checks need it.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

REPO_URL="https://github.com/Leonxlnx/taste-skill.git"
DIR="$HOME/.claude/taste-skill-src"

if [ ! -d "$DIR/.git" ]; then
  rm -rf "$DIR"
  git clone -q --depth 1 --filter=blob:none --sparse "$REPO_URL" "$DIR"
  git -C "$DIR" sparse-checkout set skills/taste-skill
elif git -C "$DIR" fetch -q --depth 1 origin HEAD 2>/dev/null; then
  # A network failure keeps the copy already here.
  git -C "$DIR" reset -q --hard FETCH_HEAD
fi

bash "$DIR/install.sh" design-taste-frontend >/dev/null

if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -x /opt/pw-browsers/chromium ]; then
  echo "export CHROME_PATH=/opt/pw-browsers/chromium" >>"$CLAUDE_ENV_FILE"
fi
