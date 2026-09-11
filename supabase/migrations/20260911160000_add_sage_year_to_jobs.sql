-- Niki fills in a 4-digit year per job (kept separate from job_number, which
-- techs text in and stays untouched) so the two can be concatenated into the
-- full Sage job number wherever the Sage push logic ends up living — not yet
-- designed, this migration only adds the field for Admin > Jobs to capture.
alter table "Cores".jobs
  add column sage_year text
  constraint jobs_sage_year_format check (sage_year is null or sage_year ~ '^[0-9]{4}$');
