-- Every time SMS Review refuses an Approve click (no job hours, missing or
-- mismatched start/stop, a job with no note) the attempt is recorded here, so
-- there is a trail of what kept getting submitted wrong and by whom instead of
-- an alert that vanishes when she closes it (Jim, 2026-09-29). Written from the
-- browser with the anon key like every other Cores table (no real auth yet, see
-- backup_log). Append-only: select + insert only, no update/delete grant.
-- submission_id is deliberately not a foreign key — deleting a junk submission
-- must not erase the record that someone tried to approve it.
CREATE TABLE "Cores".approval_block_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempted_at  timestamptz NOT NULL DEFAULT now(),
  attempted_by  text,                       -- admin name from the password gate
  submission_id uuid,
  employee_id   uuid,
  work_date     date,
  reasons       jsonb NOT NULL,             -- array of the messages she was shown
  snapshot      jsonb NOT NULL DEFAULT '{}' -- status, from_phone, times, lunch, total_hours, entry_count
);
CREATE INDEX approval_block_log_attempted_at ON "Cores".approval_block_log (attempted_at DESC);
CREATE INDEX approval_block_log_submission ON "Cores".approval_block_log (submission_id);
ALTER TABLE "Cores".approval_block_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON "Cores".approval_block_log TO anon, authenticated;
CREATE POLICY "approval_block_log_select" ON "Cores".approval_block_log FOR SELECT USING (true);
CREATE POLICY "approval_block_log_insert" ON "Cores".approval_block_log FOR INSERT WITH CHECK (true);
