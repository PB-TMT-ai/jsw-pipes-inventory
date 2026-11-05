#!/bin/bash
# Installs gstack (https://github.com/PB-TMT-ai/gstack) into ~/.claude/skills/gstack at the start
# of every Claude Code cloud session, so its skills (/design-shotgun, /review, /qa, /browse …) are
# available. Cloud containers start fresh, so a global install does not survive between sessions.
#
# - Cloud sessions only. On a laptop, install gstack yourself (see CLAUDE.md → gstack).
# - Fast when nothing changed: it fetches the fork's latest commit and re-runs setup only if the
#   commit or this script changed since the last successful install.
# - The container's network blocks Playwright's browser download, so instead of downloading,
#   the Chromium build gstack's Playwright asks for is pointed at the one already installed.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

REPO_URL="https://github.com/PB-TMT-ai/gstack.git"
DIR="$HOME/.claude/skills/gstack"
MARK="$DIR/.session-install.sha256"

if ! command -v bun >/dev/null 2>&1; then
  echo "install-gstack: bun is not installed, so gstack was skipped" >&2
  exit 0
fi

mkdir -p "$HOME/.claude/skills"
if [ ! -d "$DIR/.git" ]; then
  rm -rf "$DIR"
  GIT_LFS_SKIP_SMUDGE=1 git clone -q --depth 1 "$REPO_URL" "$DIR"
else
  # Pick up the fork's latest commit. A network failure keeps the copy already here.
  if GIT_LFS_SKIP_SMUDGE=1 git -C "$DIR" fetch -q --depth 1 origin HEAD 2>/dev/null; then
    git -C "$DIR" reset -q --hard FETCH_HEAD
  fi
fi

# Point the Chromium revision gstack's Playwright wants at the one the container ships with.
# Runs every time: the browser folder is part of the container, not of the gstack install.
alias_chromium() {
  local browsers="${PLAYWRIGHT_BROWSERS_PATH:-}" json="$DIR/node_modules/playwright-core/browsers.json"
  [ -n "$browsers" ] && [ -d "$browsers" ] && [ -w "$browsers" ] && [ -f "$json" ] || return 0
  local name want have
  for name in chromium chromium_headless_shell; do
    want=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(next(b['revision'] for b in d['browsers'] if b['name']==sys.argv[2]))" \
      "$json" "${name//_/-}" 2>/dev/null) || continue
    [ -e "$browsers/$name-$want" ] && continue
    have=$(ls -d "$browsers/$name"-[0-9]* 2>/dev/null | sort -V | tail -1)
    [ -n "$have" ] && ln -s "$have" "$browsers/$name-$want"
  done
}

current() { { git -C "$DIR" rev-parse HEAD; sha256sum "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/install-gstack.sh"; } | sha256sum; }

if [ -x "$DIR/browse/dist/browse" ] && [ -f "$MARK" ] && [ "$(current)" = "$(cat "$MARK")" ]; then
  alias_chromium
  exit 0
fi

# Delete the old marker first, so a failed install runs again next session.
rm -f "$MARK"
( cd "$DIR" && bun install --frozen-lockfile >/dev/null 2>&1 || bun install >/dev/null )
alias_chromium
( cd "$DIR" && ./setup --no-prefix --no-team --no-plan-tune-hooks -q </dev/null >"$DIR/.session-install.log" 2>&1 ) || {
  echo "install-gstack: gstack setup failed; see $DIR/.session-install.log" >&2
  tail -5 "$DIR/.session-install.log" >&2
  exit 1
}
current >"$MARK"
echo "install-gstack: gstack $(cat "$DIR/VERSION" 2>/dev/null) installed" >&2
