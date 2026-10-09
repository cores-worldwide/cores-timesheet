#!/bin/bash
# Weekly "What's New" for the office. Run by launchd (com.jim.cores-whats-new, Fridays 7:00)
# or by hand. Writes docs/whats-new/<date>.json + whats-new-<date>.html/.pdf and shows a Mac
# notification. Read-only on the repo apart from docs/whats-new/; never commits or pushes.
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
# WN_DIR / WN_UNTIL override the folder (under docs/whats-new) and issue date, for test runs.
REL="${WN_DIR:-docs/whats-new}"
OUT="$REPO/$REL"
LOG="$OUT/weekly.log"
mkdir -p "$OUT"
exec >>"$LOG" 2>&1
echo "=== $(date '+%Y-%m-%d %H:%M') ==="

notify() { osascript -e "display notification \"$1\" with title \"Cores What's New\" sound name \"Glass\"" || true; }

cd "$REPO" || exit 1
START=$(date +%s)
git fetch -q origin main || echo "warning: git fetch failed, using last fetched origin/main"

UNTIL="${WN_UNTIL:-$(date +%F)}"
# Start the day after the last issue, so nothing is missed or repeated; 7 days back if none.
LAST=$(ls "$OUT" | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.json$' | sed 's/\.json$//' | grep -v "^$UNTIL$" | sort | tail -1)
if [ -n "$LAST" ]; then SINCE=$(date -j -v+1d -f %F "$LAST" +%F); else SINCE=$(date -j -v-6d +%F); fi
echo "period $SINCE .. $UNTIL"

PROMPT=$(sed -e "s#docs/whats-new/{{UNTIL}}#$REL/{{UNTIL}}#g" -e "s#--out docs/whats-new#--out $REL#g" -e "s#under docs/whats-new/#under $REL/#g" \
  -e "s/{{SINCE}}/$SINCE/g" -e "s/{{UNTIL}}/$UNTIL/g" "$REPO/scripts/whats-new-prompt.md")

RESULT=$("$HOME/.local/bin/claude" -p "$PROMPT" \
  --permission-mode default \
  --allowedTools "Bash(git log:*)" "Bash(git show:*)" "Bash(gh pr view:*)" \
                 "Bash(python3 scripts/whats-new.py:*)" "Read" \
                 "Write(docs/whats-new/**)" "Edit(docs/whats-new/**)" 2>&1 | tail -1)
echo "claude: $RESULT"

PDF="$OUT/whats-new-$UNTIL.pdf"
if [ -f "$PDF" ] && [ "$(stat -f %m "$PDF")" -ge "$START" ]; then
  case "$RESULT" in
    QUIET*) notify "Quiet week: nothing new for Niki and Tracy. File is in docs/whats-new." ;;
    *)      notify "This week's issue is ready in docs/whats-new ($UNTIL). ${RESULT#READY: }" ;;
  esac
else
  notify "Couldn't build this week's issue. See docs/whats-new/weekly.log"
fi
