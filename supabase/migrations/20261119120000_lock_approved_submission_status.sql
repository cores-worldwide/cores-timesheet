-- An approved submission can't go back to submitted/rejected/collecting while
-- its hours are still in Timesheets. Backstop for the phone-app autosave bug
-- found 2026-11-19 (Nicolae, Nov 17): an editor left open while the office
-- approved the day flipped it back to 'submitted', the office rejected that
-- copy as a duplicate, and the paid day dropped out of SMS Review's Approved
-- list. The office's own paths (Revert to Pending, deleting from the
-- Timesheets tab) delete the timesheet_entries first, so they still work.
create or replace function "Cores".sms_submissions_lock_approved()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'approved' and new.status is distinct from 'approved'
     and exists (select 1 from "Cores".timesheet_entries t where t.source_submission_id = old.id) then
    raise exception 'This day is already approved and in Timesheets. Use Revert to Pending in Timesheets to change it.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists sms_submissions_lock_approved on "Cores".sms_submissions;
create trigger sms_submissions_lock_approved
  before update of status on "Cores".sms_submissions
  for each row execute function "Cores".sms_submissions_lock_approved();
