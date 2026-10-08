-- New-hire texting check (Jim, 2026-10-08). Some phones can receive texts
-- from the bot but their own texts never reach Twilio (Jim's magicJack VoIP
-- number, found 2026-10-08), and nothing warned anyone. When a hire is added,
-- the bot texts them "reply YES"; any text that arrives from their Cell Number
-- proves it works. The Admin Panel shows which numbers are confirmed.
--
-- phone_check_sent_at: when the check text last went out (also rate-limits
--   re-sends, since the send action can't be authenticated until real logins).
-- phone_verified_at: when a text from this Cell Number last reached the bot.
--   Cleared by the Admin Panel when the Cell Number changes.
ALTER TABLE "Cores".employees
  ADD COLUMN IF NOT EXISTS phone_check_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

-- Everyone whose Cell Number has already reached the bot counts as confirmed:
-- the most recent submission sent from that number (WhatsApp and app entries
-- don't count, they prove nothing about plain texting).
UPDATE "Cores".employees e
SET phone_verified_at = s.last_text
FROM (
  SELECT right(regexp_replace(from_phone, '\D', '', 'g'), 10) AS digits, max(created_at) AS last_text
  FROM "Cores".sms_submissions
  WHERE from_phone ~ '^\+?[0-9]{10,11}$'
  GROUP BY 1
) s
WHERE e.phone IS NOT NULL
  AND right(regexp_replace(e.phone, '\D', '', 'g'), 10) = s.digits
  AND e.phone_verified_at IS NULL;
