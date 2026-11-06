# Service report — dev review

The report builder lives inside Job Reports on dev. Production release is not approved.

## Review and restart

- [Job Reports on dev](http://127.0.0.1:5212/cores-timesheet/#/reports): open a job → **Build service report**. Refresh an already-open page after editor updates.
- Local branch `dev-report-builder`, checkout `/private/tmp/cores-report-builder-dev`, based on `origin/main` at `9ed8379`. The original checkout's unfinished SMS changes remain untouched. The local branch keeps the implementation if the temporary checkout is removed.
- Start with `npm run dev -- --host 127.0.0.1 --port 5212 --strictPort`. The checkout uses the existing ignored `.env.development.local` through a symlink. Install dependencies and restore that link if recreating the checkout. The green DEV banner and exact dev-project guard are required.
- Source: `docs/mockups/report-builder/`; `scripts/copy-report-builder.mjs` copies the editor into ignored `public/report-builder/` for `npm run dev` only, so a production build does not publish it. A production release will need to decide how the editor ships. React integration: `src/components/ReportBuilder.jsx`, `src/components/Reports.jsx`, `src/utils/reportBuilderData.js`. Standalone preview remains available for layout QA; the integrated page supplies the job/date/crew context.

## Opening page

Jim's supplied Cores letterhead is retained. Labels and fields share compact rows in editing, preview and print; phone layouts use one field per row. Printed labels/values remain readable at 9/10 pt. The cover grows rather than clipping if exceptional content needs more space. Content order:

| Group | Fields |
| --- | --- |
| Vessel | Vessel name prominently at the top; optional vessel photo with add/replace, edit and remove controls |
| Customer | Customer name; requested by |
| Job | Author name; author location; job started; job finished; fixed job number; destination; participants; reason for visit |
| Engine | Select engine; engine type/model; serial number; manufacturer; Main/Auxiliary duty |

- **Job number is fixed.** There is no in-report job dropdown or navigation request. The parent job supplies the number, overwriting obsolete stored numbers. Choose another job outside the editor in Job Reports.
- **Visit dates (Jim, 2026-11-06):** start/finish default to the first and last actual work dates shown on the job page, never the filter's own dates. If the filter shows no work for this job, the whole job's dates and crew are used. Manual dates persist through context changes and reopening. **Use report dates** restores automatic defaults.
- **Participants** default to this report's crew. Authored participants remain editable. Customer/vessel and reason defaults use available job records without replacing non-empty report edits. Author location and destination are not inferred from a vessel name; the customer requester is not guessed from a generic contact record.
- **Engine selection:** all dev engine records are labelled by vessel, maker/model, serial, side and category, with this vessel's records grouped first. A single job-linked engine may be suggested; several candidates require a choice. Selecting fills recorded model/type, serial, manufacturer and an explicit Main/Auxiliary category. Genset/Emergency/etc. are not assumed to mean Auxiliary. Manual details remain possible. A read-only check found 70 existing dev engines, all with vessel labels, without warnings.
- PO, arrival time, postal/ZIP, hours, RPM, horsepower and the separate report-date input are no longer opening-page fields. Legacy location/arrival/engine values migrate where their meaning matches; the old cover is retained in `coverArchive` for recovery. The company letterhead address stays intact.
- The optional vessel photo uses the same crop/resize editor and browser draft storage as body pictures. Upload limit is 4 MB per file. The title is **SERVICE & INSPECTION REPORT**. Exact old default section headings **What Was Done — whole job** migrate to **Job Summary**; custom headings are retained.

## Flexible body and images

- Text sections support headings, paragraphs, bullets, numbering and alignment. Components can be dragged, reordered, duplicated and removed.
- **Add to report** beside Job Summary, date-range summaries, Crew, Supplies Used and Full Work Log inserts editable copies. Individual work notes/photos can also be selected. Editing report copies leaves source records untouched. Crew/supplies/log copies follow the visible date filters; whole-job summaries are explicitly labelled as all dates.
- Image sizes: full page = one image; half page = two stacked; quarter page = two across/four per page. Neighbouring quarter-page sections share the grid even when added separately. Text, page breaks, other sizes and empty placeholders separate groups; the fifth quarter-page image continues on another page. Captions and original section identities remain intact.
- **Edit image:** draw a crop, move/resize its boundary, zoom/reposition, enter precise crop percentages, and size the image to 25–100% of its frame. Apply saves crop metadata; Cancel discards pending changes; Reset original restores the source view. Originals are retained. Captions sit below images.
- Imported job photos link to existing dev storage objects. Local uploads stay in the browser draft. PDF/file attachments preview or open; browser printing lists PDF attachments rather than merging their source pages.

## Draft storage and recovery

- Close waits for a confirmed save and stays open with a warning if it fails; leaving the job saves on the way out. A draft this version cannot read is left untouched and saving is blocked. Fields the author edits or clears are not refilled from the job. Reset sample report exists only in the standalone preview. There is no section limit.
- Separate drafts per job: IndexedDB database `cores-report-drafts`, store `drafts`, keys `cores-service-report-dev-<job-id>-v1`. Standalone QA uses `cores-report-builder-mockup-v1`.
- Earlier localStorage drafts are read when no IndexedDB copy exists. Only a successfully committed replacement permits removal of that draft's old copy. Image-heavy reports no longer depend on localStorage's small quota.
- Writes snapshot their input and queue. The image dialog shows progress, blocks duplicate clicks/closing during a write, and closes only after commit. Failures preserve the previous saved edit and leave adjustments open for retry. Read failures block overwriting an unread draft. Project context is read-only; no Supabase records/settings are changed.
- An open draft and pending crop were recovered into its normal key and a backup key ending `-recovery-<timestamp>`. Recovery copies remain in that browser's IndexedDB. No actual report content or crew personal data was copied into repo/vault notes.

## Next session handoff — 2026-11-06

- Current implementation is local branch `dev-report-builder`, commit `e851c7b` (compact inline cover patch), clean after commit. The original checkout is on `report-builder-mockup`; its report notes track this dev branch. No app push/deployment occurred today.
- Jim reviews the latest cover on dev, including real names/long values, optional vessel photo, engine catalogue scope, visit-date defaults and the finished print appearance. The available engine list currently includes all engines, with this vessel first. This is implemented; final acceptance/release is outstanding.
- Build server-backed/shared drafts and filing finished reports into the job's Files area; choose the production storage/export design first. Current saves and recovery backups are in this browser's IndexedDB.
- Complete final PDF export: merge attached PDF pages, proper dynamic page numbering, and remaining pagination/attachment handling. Current browser print handles the tested one-page cover and image pages; PDF files are listed as attachments.
- Before any release: Jim's dev review/approval, normal branch/PR workflow and his explicit production approval. Pushing `main` publishes GitHub Pages immediately. No migrations, edge functions, production records, schema/RLS/auth settings or dev-data refresh were changed for the report builder.
- Separate open PR: [#140 — reload banner](https://github.com/cores-worldwide/cores-timesheet/pull/140), confirmed by a read-only open-PR search on 2026-11-06. It was not merged or modified today. No report-builder PR exists because this work has not been pushed.
- Original checkout WIP was preserved: `scripts/test-sms.mjs`, `supabase/functions/sms-timesheet/index.ts`, untracked cheat sheets/measurement/video/text-flow material and the existing action-rate-limit migration. These are separate work, not part of this report change or its validation.

## Verification and remaining work

- 2026-11-06 review fixes: `tests/report-review-fixes.browser.js` (19 checks), run with mocked job data and database writes blocked. Videos are not offered as report photos and the editor refuses them; they stay viewable on the job page.
- Seven mapping/dev-guard checks pass for safe job defaults, engine choice, legacy field migration and date overrides.
- Thirty-one cover browser checks pass: field order, optional photo upload/edit/reopen, locked job, engine catalogue/selection, date defaults/manual overrides/reset, participants, legacy fields/title migration, inline customer/date labels, optional-photo omission, mobile width, save/reopen, and zero database-write requests.
- Letter PDFs with and without a vessel photo, all requested fields and a 600-character reason were extracted/rendered and visually checked at the final print font size. Each cover stays on page one; body text begins on page two.
- Nineteen integrated Job Reports checks pass with the revised cover and Job Summary heading. Earlier checks cover quarter-page flow, image cropping/printing and a deliberately full localStorage area plus interrupted-save retry. Tests are under `tests/`; run browser fixtures with `playwright-cli run-code --filename=…` against port 5212. `npm run build` passes; the existing bundle-size warning remains.
- Remaining production design: server-backed report filing/shared drafts, final PDF merging/export and real page numbering. Current drafts are browser-local. No app push/deploy or production testing is approved.
