-- Per diem only ever has five legitimate values: 0 (no PD), 1 (standard --
-- auto-converted from a texted location or "yes"), or a Niki-only override
-- to a quarter/half/three-quarter day (0.25, 0.5, 0.75). Confirmed with
-- Jim, 2026-09-14 (0.5 first, then 0.25/0.75 added same day). Locks down
-- what was previously an unbounded numeric so a stray value (e.g. the old
-- x1.5/x2 dropdown options this same change removed from the UI) can never
-- land in a row again.
alter table "Cores".sms_submissions
  drop constraint sms_submissions_per_diem_nonneg;
alter table "Cores".sms_submissions
  add constraint sms_submissions_per_diem_allowed
  check (per_diem is null or per_diem in (0, 0.25, 0.5, 0.75, 1));

alter table "Cores".timesheet_entries
  add constraint timesheet_entries_per_diem_allowed
  check (per_diem is null or per_diem in (0, 0.25, 0.5, 0.75, 1));
