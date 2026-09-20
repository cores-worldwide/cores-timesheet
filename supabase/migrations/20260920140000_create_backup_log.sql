-- Every scheduled backup job records its outcome here so the morning
-- egress-check routine can confirm backups are actually happening — a
-- rolling backup that silently stops is indistinguishable from one that
-- works unless something checks (Jim, 2026-09-20). Written by the GitHub
-- Actions workflows via PostgREST with the anon key (same direct-table
-- access every Cores table has, since the app has no real auth yet).
-- Append-only in practice; details holds whatever the job measured, e.g.
-- Drive folder sizes after upload, so a row proves the outcome, not just
-- that the job ran.
CREATE TABLE "Cores".backup_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ran_at      timestamptz NOT NULL DEFAULT now(),
  job         text NOT NULL,              -- 'drive-backup' | 'schema-artifact' | 'thumbnails'
  ok          boolean NOT NULL,
  details     jsonb NOT NULL DEFAULT '{}',
  run_url     text
);
CREATE INDEX backup_log_job_ran_at ON "Cores".backup_log (job, ran_at DESC);
ALTER TABLE "Cores".backup_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON "Cores".backup_log TO anon, authenticated;
CREATE POLICY "backup_log_select" ON "Cores".backup_log FOR SELECT USING (true);
CREATE POLICY "backup_log_insert" ON "Cores".backup_log FOR INSERT WITH CHECK (true);
