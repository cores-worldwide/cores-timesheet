#!/usr/bin/env bash
# Upserts the rows written by scripts/usage-snapshot.mjs into "Cores".usage_daily.
#
#   scripts/usage-upsert.sh <db-url-or-conninfo> [rows.json]
#
# A re-run overwrites that day's numbers (the provider's latest word wins).
set -euo pipefail
conn="$1"; file="${2:-usage-rows.json}"
[ -s "$file" ] || { echo "usage-upsert: $file missing or empty, nothing to write"; exit 0; }
psql "$conn" -v ON_ERROR_STOP=1 -q -v rows="$(cat "$file")" <<'SQL'
INSERT INTO "Cores".usage_daily (day, service, metric, value, unit, cost_usd, source, details, updated_at)
SELECT day, service, metric, value, unit, cost_usd, source, coalesce(details, '{}'::jsonb), now()
FROM jsonb_to_recordset(:'rows'::jsonb) AS r(day date, service text, metric text, value numeric,
  unit text, cost_usd numeric, source text, details jsonb)
ON CONFLICT (day, service, metric) DO UPDATE SET
  value = excluded.value, unit = excluded.unit, cost_usd = excluded.cost_usd,
  source = excluded.source, details = excluded.details, updated_at = now();
SELECT count(*) AS usage_daily_rows FROM "Cores".usage_daily;
SQL
