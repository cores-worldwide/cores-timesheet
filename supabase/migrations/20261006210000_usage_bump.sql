-- Live counters for the Traffic Desk (Jim, 2026-10-06). The SMS bot adds to
-- today's totals in "Cores".usage_daily as it works: each Claude call (calls,
-- tokens, cost worked out from list prices) and each Resend email. Those are
-- the two things no provider reports to us (the Anthropic account is an
-- individual plan with no usage API; Resend isn't polled).
--
-- One call takes a batch of {service, metric, value, unit, cost_usd} and adds
-- each to today's row (America/Halifax day), source 'counter'. Adding in SQL
-- keeps two texts processed at the same moment from overwriting each other.
-- Only the bot (service role) may call it.
CREATE OR REPLACE FUNCTION "Cores".usage_bump(p_rows jsonb)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO "Cores".usage_daily (day, service, metric, value, unit, cost_usd, source, updated_at)
  SELECT (now() AT TIME ZONE 'America/Halifax')::date, r.service, r.metric, r.value, r.unit, r.cost_usd, 'counter', now()
  FROM jsonb_to_recordset(p_rows) AS r(service text, metric text, value numeric, unit text, cost_usd numeric)
  ON CONFLICT (day, service, metric) DO UPDATE SET
    value = "Cores".usage_daily.value + excluded.value,
    cost_usd = CASE WHEN excluded.cost_usd IS NULL THEN "Cores".usage_daily.cost_usd
                    ELSE coalesce("Cores".usage_daily.cost_usd, 0) + excluded.cost_usd END,
    updated_at = now();
$$;
-- The live project grants this by default; spelled out so a rebuilt or dev
-- database behaves the same.
GRANT SELECT, INSERT, UPDATE ON "Cores".usage_daily TO service_role;
REVOKE ALL ON FUNCTION "Cores".usage_bump(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "Cores".usage_bump(jsonb) TO service_role;
