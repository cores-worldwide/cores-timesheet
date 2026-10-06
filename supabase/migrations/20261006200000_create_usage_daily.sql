-- Traffic & credit dashboard (Jim, 2026-10-06). One row per day per service per
-- metric: how many times each outside service was touched, what it cost, and
-- the prepaid balance where the provider reports one. Filled nightly by
-- scripts/usage-snapshot.mjs (.github/workflows/usage-snapshot.yml) and later
-- by live counters in the SMS bot (source 'counter'). Read by Jim's private
-- dashboard page through the Supabase connector, never by the crew app.
--
-- Costs and balances are Jim's business, not the crew's: no anon or
-- authenticated access at all. The job writes over SUPABASE_DB_URL.
--
--   day      local (America/Halifax) calendar day the numbers cover
--   service  'supabase' | 'twilio' | 'claude' | 'resend' | 'drive' ...
--   metric   e.g. 'rest_requests', 'egress_bytes', 'sms_outbound', 'cost', 'balance'
--   source   'provider' = the provider's own number, 'estimate' = worked out
--            by us (e.g. egress from logs), 'counter' = counted live by our code
CREATE TABLE "Cores".usage_daily (
  day        date NOT NULL,
  service    text NOT NULL,
  metric     text NOT NULL,
  value      numeric NOT NULL DEFAULT 0,
  unit       text,
  cost_usd   numeric(12,4),
  source     text NOT NULL CHECK (source IN ('provider', 'estimate', 'counter')),
  details    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, service, metric)
);
CREATE INDEX usage_daily_service_day ON "Cores".usage_daily (service, day DESC);
ALTER TABLE "Cores".usage_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Cores".usage_daily FROM anon, authenticated;
