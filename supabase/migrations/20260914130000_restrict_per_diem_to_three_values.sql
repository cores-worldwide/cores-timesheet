-- Per diem only ever has three legitimate values: 0 (no PD), 1 (standard --
-- auto-converted from a texted location or "yes"), or 0.5 (Niki's explicit
-- half-day override). Confirmed with Jim, 2026-09-14. Locks down what was
-- previously an unbounded numeric so a stray >=0 value (e.g. the old x1.5/
-- x2 dropdown options this same change removed from the UI) can never land
-- in a row again.
alter table "Cores".sms_submissions
  drop constraint sms_submissions_per_diem_nonneg;
alter table "Cores".sms_submissions
  add constraint sms_submissions_per_diem_allowed
  check (per_diem is null or per_diem in (0, 0.5, 1));

alter table "Cores".timesheet_entries
  add constraint timesheet_entries_per_diem_allowed
  check (per_diem is null or per_diem in (0, 0.5, 1));
