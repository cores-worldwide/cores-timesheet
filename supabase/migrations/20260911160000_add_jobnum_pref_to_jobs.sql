-- Niki fills in a 4-digit job-number prefix per job (kept separate from
-- job_number, which techs text in and stays untouched) so the two can be
-- concatenated into the full Sage job number wherever the Sage push logic
-- ends up living — not yet designed, this migration only adds the field for
-- Admin > Jobs to capture.
alter table "Cores".jobs
  add column jobnum_pref text
  constraint jobnum_pref_format check (jobnum_pref is null or jobnum_pref ~ '^[0-9]{4}$');
