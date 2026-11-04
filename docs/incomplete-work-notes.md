# Incomplete work notes

Dev implementation approved by Jim on 2026-11-04. Production release requires his own dev test and a separate approval.

## Behaviour

Both SMS and the crew phone page retain work notes when the job or hours are missing. A supplied job stays attached; otherwise the entry uses the real `Unknown` job. Missing hours, Reg and OT stay null, rather than becoming zero or being calculated from shift times. Explicit job durations remain unchanged when shift times arrive later.

Phone create and edit use the same entry normalizer. Saves for a day are queued so an earlier note-only save cannot overwrite a subsequent job selection. Save Entry waits for the save before closing. Incomplete entries remain pending; the existing approval checks still require positive hours and valid shift details.

The SMS parser is instructed to retain incomplete descriptions. Unparsed prose and parser failures keep the original message for office review. Jobless work no longer inherits a previous job; the existing job fallback remains for photos and supplies. Parsed supplies and pure shift replies retain their existing separate handling.

The bot's pure merge helper was extracted to `supabase/functions/sms-timesheet/entries.js` so regression tests exercise the deployed logic. No database migration or project settings change is required.

## Verification

- `node --test scripts/test-incomplete-entries.mjs`: 14 regression checks passed.
- `node scripts/test-incomplete-entries-dev.mjs`: six real dev bot/DB scenarios passed, plus the actual handler's parser-failure path with a deliberately malformed parser response and real dev storage. These are HTTP simulator calls, not real SMS delivery.
- Mobile browser against dev: untouched forms create no work; note-only save, reload and edit; selected job without hours; delayed earlier autosave followed by a rapid job pick; existing approval guard. All passed. Synthetic employees, submissions and their audit rows were removed.
- Manual SMS tester UI: note-only and supplied-job messages saved as expected with blank hours; Clear removed the test records and audit rows.
- `npm run build -- --mode development` and `git diff --check` passed.

Dev bot deployed to `cores-timesheets-dev` (`giwexoouqxioxkjhoxoe`) only. Its prior source matched main before this fix; separate unfinished security edits in the original checkout were not changed. Reload-banner PR #140 was not changed.

## Jim's dev review

Run from the `preserve-incomplete-job-notes` checkout:

```sh
npm run dev -- --host 127.0.0.1 --port 3003 --strictPort
node scripts/dev-sms-preview.mjs
```

The checkout needs the existing gitignored `.env.development.local`. The simulator reads dev credentials at runtime and binds to localhost only; none are included in its page. Its Clear button and normal shutdown remove its own test messages. Audit cleanup uses the existing dev-only DB credential outside the repo.

- Phone: http://127.0.0.1:3003/cores-timesheet/#/my (green DEV banner).
- SMS simulator: http://127.0.0.1:3004/ (no real texts sent).
- Office review: http://127.0.0.1:3003/cores-timesheet/#/dashboard → SMS Review.

1. Enter only Notes, leaving Job and Hours blank. Save and reload: the note should remain under Unknown with `hrs TBD`.
2. Select a real job and enter Notes, leaving Hours blank. Save and reload: the selected job and note should remain, with `hrs TBD`.
3. Edit an incomplete entry and save it again without adding hours. The note must remain.
4. In the SMS tester, try the same two cases, then add explicit hours. The earlier text should remain. Clear the test messages afterward.

This fix is not pushed or released to production. PR #184, the separate job-picker description change, is already live.
