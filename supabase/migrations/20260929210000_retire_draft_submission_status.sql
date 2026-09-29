-- Retire the mobile app's 'draft' sms_submissions status. Autosave now writes
-- 'submitted' straight away and there is no separate "Submit day" step (Niki was
-- confused by days the techs had to submit as an extra step, 2026-09-29).
--
-- 1. Convert any existing drafts so none is left stuck and invisible in SMS
--    Review. This only changes status — entries, times, notes and messages are
--    untouched, and nothing is deleted. updated_at is left alone so the row
--    keeps its real "last touched" time.
UPDATE "Cores".sms_submissions
   SET status = 'submitted'
 WHERE status = 'draft';

-- 2. Compatibility guard. A phone that still has the previous app version open
--    will keep writing 'draft' until it reloads; rewrite that to 'submitted' at
--    the database so those saves land in the pending queue instead of getting
--    stuck (or, once the CHECK below is tightened, failing outright and losing
--    the tech's entry).
CREATE OR REPLACE FUNCTION "Cores".sms_submissions_no_draft()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'draft' THEN
    NEW.status := 'submitted';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_submissions_no_draft ON "Cores".sms_submissions;
CREATE TRIGGER sms_submissions_no_draft
  BEFORE INSERT OR UPDATE OF status ON "Cores".sms_submissions
  FOR EACH ROW EXECUTE FUNCTION "Cores".sms_submissions_no_draft();

-- Deliberately NOT done here: dropping 'draft' from the status CHECK
-- (20260820000000_add_draft_to_sms_submissions_status_check.sql). Do that, and
-- drop the trigger above, in a follow-up once no old app version can still send it.
