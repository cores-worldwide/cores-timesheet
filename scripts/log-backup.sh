#!/usr/bin/env bash
# Records a scheduled job's outcome in Cores.backup_log so the morning
# egress-check routine can confirm backups actually happened last night.
#
#   scripts/log-backup.sh <job> <ok: true|false> [details-json]
#
# Needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Never fails the calling
# workflow: a logging hiccup must not turn a good backup into a red run (the
# routine treats a *missing* row as a problem anyway).
set -u
job="$1"; ok="$2"; details="${3:-{\}}"
run_url="${GITHUB_SERVER_URL:-}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}"
body=$(jq -cn --arg job "$job" --argjson ok "$ok" --argjson details "$details" --arg run_url "$run_url" \
  '{job: $job, ok: $ok, details: $details, run_url: $run_url}')
curl -sS -o /dev/null -w "backup_log: HTTP %{http_code}\n" \
  -X POST "${VITE_SUPABASE_URL}/rest/v1/backup_log" \
  -H "apikey: ${VITE_SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}" \
  -H "Content-Profile: Cores" -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d "$body" || echo "backup_log: could not record outcome (non-fatal)"
