-- 20260929220000 granted the anon/authenticated roles SELECT + INSERT on
-- approval_block_log, but Supabase's default privileges on the Cores schema had
-- already given them UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER as well.
-- Row-level security (no update/delete policy) already stopped API updates and
-- deletes, but the grants should match the table's append-only intent, so drop
-- the extras. Applied to production 2026-09-29 right after the table was created.
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "Cores".approval_block_log FROM anon, authenticated;
