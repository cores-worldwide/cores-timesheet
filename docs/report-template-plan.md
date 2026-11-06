# Flexible report template — draft plan

Status: the report builder is now integrated into each job's Job Reports page in an isolated dev checkout. It uses Jim's supplied letterhead/front-page fields, reads open and closed dev jobs, fills available details and imports that job's timesheet notes. Production release is not approved.

## Current dev handoff

- [Job Reports on dev](http://127.0.0.1:5212/cores-timesheet/#/reports): open a job and click **Build service report**.
- Local branch `dev-report-builder`, checkout `/private/tmp/cores-report-builder-dev`, based on current `origin/main` at `9ed8379`. The original checkout's unfinished SMS changes are untouched.
- Start here with `npm run dev -- --host 127.0.0.1 --port 5212 --strictPort`. The checkout links the existing ignored `.env.development.local`; the app must show the green DEV banner. The builder additionally checks the exact dev project URL and is hidden from production builds.
- The working editor is embedded in Job Reports to preserve its layout and avoid collisions with existing office-page styles. The host page supplies only allowed dev reads through an origin/source-checked message channel; client keys are not copied into editor assets.
- Drafts are saved separately for each job in browser storage. Changing the report's project dropdown opens that job's Job Reports page and its own draft. New integrated reports start with an empty body.
- **Project dropdown:** searchable by project number, vessel, customer or description; defaults to open and closed jobs and has separate status filters. Verified against 96 existing dev jobs (89 open, 7 closed), with no database refresh or test records added.
- **Autofill:** project number, vessel/plant name, job description as the service-request reason, stored customer contact, and identifiable engine model/serial details. Engine hours are filled only when this job has one unambiguous recorded value. Several possible engines require a choice. Missing location, arrival, PO, RPM and horsepower values stay blank. Sage work-order numbers are not treated as purchase orders.
- Re-selecting the same project preserves manual edits. Later responses from earlier selections cannot overwrite the latest choice. Switching projects keeps separate drafts; report author/date remain editable.
- **Pull from timesheets** reads only that job's written work notes, without fetching employee names for that picker. Report edits leave the original entries unchanged.
- **Add lower sections:** Job Reports offers **Add to report** for the whole-job or date-range summary, Crew, Supplies Used and Full Work Log. Notes and photographs can be selected individually, separately or together. Adding opens the builder and appends editable copies; table cells, headings and captions remain editable. Crew/supplies/work-log copies use the visible date filters; the whole-job summary explicitly includes all dates. Photograph selection stays scoped to the job and matching work-log entry. Existing database records are not modified.
- **Image sizes:** each image/file section has an **Image size** dropdown: Full page (one image), Half page (two stacked), Quarter page (four in a 2×2 grid). Extra images continue onto another page; incomplete pages keep the selected slot size. Captions sit below each image and proportions are preserved. Existing one-/two-across drafts migrate to half-/quarter-page layouts without losing images or captions. New uploads and selected job photographs default to quarter-page. Different sections can use different sizes. PDF attachments still preview/list rather than merge their source pages.
- **Edit image:** uploaded and imported photographs offer a non-destructive editor: draw a crop, move it by drag/arrow keys/position sliders, resize using corner handles or precise crop percentages, zoom, and set image size to 25–100% within its chosen page slot. Cancel discards pending edits; Reset original restores the source view and size, and Apply saves crop/size metadata with the browser draft. The original image URL/data remains intact; captions and page-size choices are preserved. Crops render consistently in the editor and browser print without a canvas copy or storage upload. Image editing is for photographs; PDF/file attachment handling is unchanged.
- **Photo storage:** imported job photographs remain links to the existing dev storage objects; captions and report wording are browser-draft copies. Removing a source storage object can make its linked report image unavailable. Production report filing/storage remains future work.
- **Section/layout verification:** 19 fixture browser checks cover section imports, editable tables/text/captions, selected photos, selection preservation, reorder/remove, save/reload, cross-job rejection and separate drafts; an actual dev work note was copied/edited without changing its source or attempting any database write, and its browser draft was restored. Thirteen image-layout browser checks cover grouping, size changes, overflow pages, captions, reload and phone width. Four image-edit boundary/markup tests and 14 editor browser checks cover drawing, moving, corner resize, zoom, precise crop, frame size, apply/cancel/reset, saved edits and phone width. The integrated checks also edit an imported dev-storage photograph. A split-colour synthetic image was cropped to its blue half and resized: both the report screenshot and rendered Letter PDF retained blue pixels and zero excluded red pixels, with the caption present. A six-page Letter PDF was extracted and rendered: cover, full-page, half-page, two quarter-page sheets (five images, including a long caption), then following text, with no blank/interleaved pages or clipped captions. Only fictional images/text were used for PDF QA. Run the two scripts under `tests/` using `playwright-cli run-code --filename=…` against port 5212. `npm run build` passes (existing bundle-size warning).
- A stale public dev client key was corrected in the existing ignored local dev configuration using an existing public key. No project keys were created/rotated, and no project-level settings changed. No credential values are recorded here.
- Checks: seven mapping/connection-guard tests; 29 standalone selector browser checks including closed jobs, missing fields, engine choice, failed reads, selection races, save/reload and mobile layout; real dev job selection/autofill; six integrated browser checks covering the selected job, switching to a closed job's separate draft, restoring the first draft, actual job-note import, zero database-write requests and the green dev banner. Browser test drafts were removed. `npm run build` passes. PDF attachments still preview rather than merge into the final PDF.

## Review the mockup

- The earlier standalone mockup remains on branch `report-builder-mockup`; the current review target is Job Reports above. Editor source is under `docs/mockups/report-builder/`; `scripts/copy-report-builder.mjs` copies the required assets for dev/build into ignored `public/report-builder/`.
- Standalone dev preview, if needed: `node scripts/serve-report-builder.mjs --port 5211`. It reads only the dev database and has no write routes.
- [Source entry point](mockups/report-builder/index.html), [earlier opening-page screenshot](mockups/report-builder/opening-page.png), [earlier editor screenshot](mockups/report-builder/preview.png).
- Text and photo/file components can be added, edited, dragged, reordered, duplicated and removed. The text toolbar includes bullets, numbering and alignment. Fictional timesheet notes can be selected and copied into editable text.
- Image/PDF uploads have individual descriptions; other formats appear as downloadable attachments. PDF preview uses the browser's built-in PDF viewer. Full-, half- and quarter-page image sizes are available.
- Front-page details and body drafts save in the current browser. Existing saved body drafts remain intact when the new front-page fields are added. This mockup uses browser storage, with a 4 MB per-file limit; this is not the proposed production storage design.
- **Print limitation:** browser printing includes the opening page, body text and pictures, but lists PDF files as attachments. Merging PDF pages, exact live pagination/repeated page numbers and production-quality export remain design/implementation work.
- Jim's supplied letterhead screenshot is retained unchanged as `assets/cores-letterhead-reference.png`. The displayed logo uses its white centre band; the header text matches his supplied company name, address, telephone, fax and email. This replaces the earlier website logo/header. Front-page fields use placeholders or fictional values rather than the reference report's populated data.
- **Browser verification:** text formatting and alignment, selected-note import, actual component drag/drop, move/duplicate/remove, image/PDF/other-file upload and descriptions, arrangement, save/reload, unchanged cover when editing the body, preview, print styles and a 390 px mobile layout were exercised. The PDF preview was also visually checked. Sample drafts were reset after testing. No real timesheet records, database writes or production calls were used.
- **Front-page verification:** all 22 inputs save/reopen, including both engine entries; project/plant-vessel values carry through to later-page headers. An older body draft was preserved when front-page fields were introduced. Editing and preview fit a 390 px viewport. A real Letter-size browser PDF was extracted and rendered for visual review: all fields and the full 600-character reason remained on page one, with body content starting on page two. These checks used an isolated browser session and fictional values.

## Front-page fields

The supplied field list is arranged into five fixed sections, with labels above values and consistent columns:

| Section | Fields |
| --- | --- |
| Project details | Project no., written by, report date |
| Plant / vessel and location | Plant / vessel, city, province / state, postal / ZIP code |
| Visit details | Purchase order no., date of arrival, time of arrival, customer contact |
| Engine details | Two engine entries, each with model, serial no., hours, RPM and horsepower |
| Reason for service request | An editable brief summary; the mockup shows its 600-character limit |

The two engine entries retain both serial-number/hour slots in the reference and use the same columns for each engine. Company branding and field positions stay fixed; report-specific values are editable. Autofilling these fields from live project records is future dev work.

## Confirmed requirements

- Niki needs a reusable report template.
- The opening/header page stays mostly static; formatting stays consistent while report data changes.
- The opening page contains the project, author/date, site/location, visit, engine and service-request fields shown above.
- Following pages are ad hoc: Niki can drag components into the report as needed.
- A text component lets her enter report text; a photo component lets her add pictures.
- Text should be able to start from timesheet descriptions and support basic formatting, including bullets and alignment.
- Media may include PDFs or other file types; each item needs a text description underneath.
- Plan the work before building it.
- Jim will supply an existing report containing most of the information; it needs corrections before becoming the template.

## Proposed report structure

Keep page one separate from the report body so adding or removing body content cannot move it or alter its layout. Use the supplied report to identify the fixed elements and the fields that change for each job.

From page two, use a sequence of sections. Each section has a heading and content; Niki can add, rename, duplicate, reorder and remove sections. Sections can grow across pages. A new section does not have to start on a new page, but Niki should be able to request a page break when needed.

Start with the two component types Jim described:

- **Text box:** optional heading, paragraphs and bullet lists, with shared typography, padding and borders.
- **Image/file block:** one or more pictures or PDF/file previews, with a consistent arrangement and an editable description underneath each item. Preserve image proportions; agree the initial arrangements from the example report.

Tables, measurement sheets and appended scans remain candidates for a later version if the example report establishes a need.

Provide a blank section and a few useful starting sections rather than requiring every report to contain the same headings. Reusing a previous report should copy its content into a new draft without changing the original. Saving custom section presets can follow once the basic workflow is proven.

## Proposed editing experience

- A component tray beside the report contains **Text** and **Photos**.
- Niki drags a component to an insertion point in the report, then types or adds pictures directly in it. Provide an **Add** button as an alternative to dragging.
- Components snap into a vertical order and expand with their content. The template controls alignment, fonts, margins and photo spacing. This keeps reports consistent as their length changes.
- Each component has simple move, duplicate and remove controls. Dragging also supports reordering.
- The fixed opening page stays visibly separate from the editable body.
- A print preview shows actual page breaks and page numbers. Saving/reopening preserves the draft; PDF export produces the reviewed report.

**Home, approved by Jim:** inside a job's Job Reports page. Filing finished output in the job's Files area remains future work; current drafts stay in the browser.

## Small first version

1. Review Jim's example report: retain the useful information, list corrections and agree the opening page.
2. Prepare a reviewable mockup of the component tray, fixed opening page and editable body. Use fictional sample content to show a short text box, long text and a photo block.
3. Review the mockup with Jim and Niki before implementing the editor.
4. Build the agreed dev version with text/photo components, reordering, save/reopen, print preview and PDF output.
5. Have Niki assemble one representative report and revise the workflow based on that trial.

Review draft access and storage before designing database changes. Store the report as ordered editable components with a shared template, so it can be reopened and revised. Keep manually edited report content separate from live job summaries so refreshing source information cannot overwrite Niki's writing. An exported report should preserve the content reviewed at export time.

## Acceptance checks

- Page one remains unchanged when body sections are edited, reordered or removed.
- Niki can create a new section with her own heading without developer help.
- Dragging or clicking Add inserts the expected text/photo component; reordering preserves its content.
- Short and long reports use the same template successfully.
- Headings stay with their text; photos stay with captions; long content paginates without overlap or clipping.
- Saving, closing and reopening preserves content and section order.
- The delivered PDF matches the reviewed report, with consistent page numbering.
- All feature writing/testing happens on dev first, followed by Jim's dev review and separate production approval.

## Open decisions

- Is this a customer job/service report, a measurement/inspection report, or something else?
- Which parts of Jim's forthcoming example report need correction?
- Which front-page values should be prefilled from job records, and which should be entered by the office?
- Should finished reports be filed automatically in the job's Files area, or only when the office chooses to file them?
- Which photo arrangements are essential for version one? Are tables or appended files needed immediately?
- What does the recipient need: PDF only, an editable copy, or both?

## Existing implementation reviewed

Local `origin/main` at `9ed8379` has job file upload/storage and fixed Scan to Report measurement templates. `JobFiles.jsx` explicitly supports externally written reports; `reportTemplates.js` maps a fixed spreadsheet template. Neither provides the section editor described here. The current working branch contains unrelated unfinished work; this planning task does not change that code.
