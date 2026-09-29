-- The sms-timesheet edge function's "no existing submission -> insert" step has
-- no locking, so two first texts of the day arriving within a few hundred ms
-- (a tech firing several messages at once, or a queued burst flushing) both
-- see no row and both insert, leaving the office two SMS Review rows for one
-- day (2026-09-29: Jim's "Adjust air start distributor" text was orphaned on a
-- second row). This partial unique index makes the second concurrent insert
-- fail; the function treats that (23505) as "someone else just created it"
-- and retries, merging into the winner's row.
--
-- Scoped to real-phone conversations only: 'mobile-app', 'admin-manual' and
-- 'system-stat-grant' rows are not text conversations, day-off requests are a
-- separate row by design, and stat-grant placeholders sit alongside the real
-- row. employee_id is coalesced so a not-yet-identified sender still collides.
CREATE UNIQUE INDEX IF NOT EXISTS sms_submissions_one_open_per_phone_employee_day
  ON "Cores".sms_submissions (
    from_phone,
    (COALESCE(employee_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    work_date
  )
  WHERE status IN ('collecting', 'submitted')
    AND is_stat_grant = false
    AND is_day_off = false
    AND from_phone ~ '^[0-9+]+$';
