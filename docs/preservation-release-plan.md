# Preservation fix: release plan

Prepared 2026-11-04. Jim reports that his personal dev test of a text without a job number correctly saved under Unknown and requests this fix in production. Final approval of this plan is still required. No production action or branch push has occurred.

## Exact scope

Runtime commit: `3dac212` on `preserve-incomplete-job-notes`, based directly on live main `6b6c3cf` (PR #184). This plan is a documentation-only addition. The separate `dev-submission-follow-up` branch has no additional commits or implementation yet; the newer failure-flag/alert proposal is excluded. Reload-banner PR #140, unfinished SMS/security edits, and the unrelated untracked migration in the original checkout are excluded.

Files from `3dac212`:

- `src/employee/EmployeeHome.jsx`
- `src/employee/PendingEntryEdit.jsx`
- `src/utils/draftEntries.js`
- `supabase/functions/sms-timesheet/index.ts`
- `supabase/functions/sms-timesheet/entries.js`
- `scripts/test-incomplete-entries.mjs`
- `scripts/test-incomplete-entries-dev.mjs`
- `scripts/dev-test-cleanup.mjs`
- `scripts/dev-sms-preview.mjs`
- `docs/incomplete-work-notes.md`

Only the five source files change running app/bot behaviour. The four scripts are local tests/dev tools, not scheduled jobs or notification senders. This file adds the reviewable release plan.

The fix preserves descriptions, retains supplied jobs, uses Unknown when no job is supplied, and keeps missing hours null. Job hours are no longer inferred from shift bounds or overwritten by them. Queued phone saves prevent an older incomplete save from overwriting a later job selection. Parser trouble keeps the original message for office review. The existing approval gate still applies.

## Preflight evidence

- Current GitHub main is `6b6c3cfa87ad371d1eb34952e6a9216a6f23d03e`; its Pages workflow succeeded. The release has no unrelated upstream gap.
- Isolated checkout has no unrelated tracked changes. Only owned, untracked test output and a dependency symlink are excluded from staging.
- Added-line/path scan found no credentials, token literals, private keys or credential files in the release. Local `.env` links are gitignored and excluded.
- `npm run build` passed with the existing production build configuration. Development build also passed. The existing large-bundle warning remains.
- `node --test scripts/test-incomplete-entries.mjs`: all 14 passed, including a fresh preflight run.
- Real dev bot/database tests: six scenarios passed. The actual handler's parser-failure path also saved to dev with an intentionally malformed parser response. These were HTTP simulator calls, not real SMS delivery.
- Real mobile browser/dev database: description-only save/reload/edit, selected job without hours, untouched form, delayed-save race and existing approval blocker passed.
- The manual SMS simulator UI passed both key cases and cleared its records. Agent-created employee/submission/audit fixtures were removed and checked. Jim's own dev review data is not copied to production.
- No migration is introduced or selected by this release. No database push or migration-history change is needed; the unrelated security migration must not be applied.
- Production `sms-timesheet` is active v190 with `verify_jwt=false`. Its downloaded source exactly matches main `6b6c3cf`. Rollback copy: `/private/tmp/cores-timesheets-preservation-rollback/supabase/functions/sms-timesheet/index.ts`.

## Publishing and release order after approval

1. Push only `preserve-incomplete-job-notes` and open a PR to `cores-worldwide/cores-timesheet:main`. Verify the PR contains only this fix and its tests/docs. Branch push does not publish the Pages app.
2. Database: no migrations and no project-level settings changes.
3. Deploy only `sms-timesheet` from the approved release commit to production project `wgjuflwbkmgirhqoqfgp`, including `entries.js`. Preserve its existing webhook/JWT setting; no authentication change is requested. Verify the active version increased and deployed source matches the release.
4. Merge that PR through normal protection/build checks. Main automatically publishes the app to GitHub Pages. Do not merge PR #140 or any other branch.
5. Wait for the Pages build and deployment to succeed for the merge commit.
6. One read-only release verification: check the live app bundle contains the new entry normalizer and the active production bot matches the approved source. Do not send a test SMS or create/change crew records. This does not claim a live end-to-end SMS delivery test.

Live app: https://cores-worldwide.github.io/cores-timesheet/ . The Netlify address was fetched read-only and confirmed to redirect here; it is not deployed in this release. No launchd job, other edge function, redirect or hosting setting changes.

## Rollback and stop conditions

- Before merge, a PR/branch can remain unmerged without changing the live site.
- Bot: redeploy the saved v190 source (also present in main baseline `6b6c3cf`), retaining the existing webhook configuration.
- Frontend: revert this release's merge through a PR and let the normal Pages workflow deploy the revert.
- Database: no rollback required because no database change ships.
- If any release step fails, stop and report what is live and what remains unchanged; do not skip gates, alter the release scope or retry with changed code.

Crew payroll is live. Release only this reviewed scope. The future office failure queue, repeated-attempt alerts and notification previews are separate dev work and are not part of this approval.
