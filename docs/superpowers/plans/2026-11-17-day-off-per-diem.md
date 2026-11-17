# Per Diem on a Day Off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let techs (app and text) and Niki (Timesheets tab) mark a day off with per diem, let Niki set/adjust per diem on any day-off card in SMS Review, and have Approve Day Off save it.

**Architecture:** Office day offs are `sms_submissions` rows (`is_day_off = true`, no entries) created by a new helper beside `submitManualEntry`, so they go through SMS Review like every office entry. The day-off card gets a per diem dropdown that writes `sms_submissions.per_diem`; approval reads it through the existing `dayPerDiem(sub)` resolver.

**Tech Stack:** React (Vite), supabase-js against schema `"Cores"`, `node:test` for pure helpers.

**Spec:** `docs/superpowers/specs/2026-11-17-day-off-per-diem-design.md`

## Global Constraints

- Per diem choices exactly: None (0), ×0.25 Quarter, ×0.5 Half, ×0.75 Three-Quarter, ×1 Standard. The database CHECK allows only these.
- No migration. One bot change (Task 5), tested on the dev bot; production deploy only from merged main after checking the live bot matches main (CLI deploy, never via MCP).
- A tech's claim is always ×1 (no fractions parsed from techs).
- Day off only via an explicit "Day off" choice; a blank day never gets per diem.
- Office day offs land in SMS Review as `submitted`; nothing writes `timesheet_entries` except Approve.
- All testing on the dev database (`.env.development.local`, green DEV banner) using Jim's dev record `de935e6c-8d7f-435c-8620-ee09e5e4acae`; remove test rows after.

## Review Focus

- Day off on a date that already has approved hours → refused with a message naming the hours; nothing saved.
- Day off on a date that already has a day off (approved or pending) → refused; no duplicate pending card.
- Tech's own Day Off (per_diem null) approved without touching the dropdown → per diem 0, exactly as today.
- Changing the dropdown then approving immediately → approval uses the new value (not a stale one).
- Switching "Day off" off again in the manual form → normal job/time validation and save unchanged.

---

### Task 1: Day-off helpers in entrySave.js

**Files:**
- Modify: `src/utils/entrySave.js` (beside `submitManualEntry`)
- Test: `scripts/test-day-off.mjs` (new; add `"test:day-off": "node --test scripts/test-day-off.mjs"` to package.json)

**Interfaces:**
- Produces:
  - `dayOffSubmissionRow({ employeeId, workDate, perDiem, adminName }) -> object` — the insert row.
  - `dayOffConflict({ approvedEntries, pendingDayOff }) -> string | null` — `approvedEntries` = that person's `timesheet_entries` rows for the date (`hours`, `is_day_off`); `pendingDayOff` = boolean.
  - `async submitDayOff(supabase, { employeeId, workDate, perDiem, adminName }) -> { error }` — reads entries + pending day-off submissions for that employee/date, returns `{ error: { message } }` from `dayOffConflict` if any, else inserts `dayOffSubmissionRow(...)`.

- [ ] **Step 1: Write failing tests** in `scripts/test-day-off.mjs`:
  - `dayOffSubmissionRow({ employeeId:'e1', workDate:'2026-11-15', perDiem:1, adminName:'Niki' })` deep-equals `{ from_phone:'admin-manual', employee_id:'e1', work_date:'2026-11-15', is_day_off:true, entries:[], supplies:[], per_diem:1, per_diem_location:'Office entry', status:'submitted', admin_note:'Entered manually by Niki' }`.
  - perDiem 0 → `per_diem:0, per_diem_location:'none'`; no adminName → `admin_note:null`.
  - `dayOffConflict({ approvedEntries:[{hours:'10.50',is_day_off:false}], pendingDayOff:false })` matches `/already has 10.5 hours/`.
  - approved day-off row → matches `/already a day off/`; `pendingDayOff:true` → matches `/already waiting in SMS Review/`.
  - `dayOffConflict({ approvedEntries:[], pendingDayOff:false })` → `null`; a stat-pay row (`is_stat_pay:true, hours:8`) alone → `null` (stat pay doesn't block a day off).
- [ ] **Step 2: Run** `node --test scripts/test-day-off.mjs` — expect FAIL (exports missing).
- [ ] **Step 3: Implement** the three exports. `submitDayOff` queries `timesheet_entries` (select `hours, is_day_off, is_stat_pay`) and `sms_submissions` (`is_day_off = true`, status in `submitted`,`collecting`) for employee+date.
- [ ] **Step 4: Run** `node --test scripts/test-day-off.mjs` — expect all PASS; `npm run build` passes.
- [ ] **Step 5: Commit** `scripts/test-day-off.mjs src/utils/entrySave.js package.json` — "Add day-off submission helpers".

### Task 2: SMS Review — per diem on the day-off card and on approval

**Files:**
- Modify: `src/components/SmsReview.jsx` (day-off card ~line 933; approve day-off branch ~line 342; header chip ~line 870)

**Interfaces:**
- Consumes: existing `dayPerDiem(sub)`; `PER_DIEM_VALUES`.

- [ ] **Step 1: Card dropdown.** On a `submitted`/`collecting` day-off card, under "Requesting this day off", a `<select>` labelled "Per diem" with the five Global choices, value `String(dayPerDiem(sub))`. On change: update `sms_submissions.per_diem` (Number) for `sub.id`, then update local `submissions` state. Approved/deleted cards show the value read-only.
- [ ] **Step 2: Chip.** Day-off chip reads `🏖️ Day off` or `🏖️ Day off — per diem ×N` when `dayPerDiem(sub) > 0`.
- [ ] **Step 3: Approve.** In the `if (sub.is_day_off)` insert, `per_diem: dayPerDiem(sub)` instead of `0`. Approve must use the row as just saved: if a dropdown save is in flight, disable Approve until it resolves.
- [ ] **Step 4: Verify on dev** (local app, office view): create a day-off submission for Jim's dev record via psql (`is_day_off=true, entries='[]', status='submitted', from_phone='mobile-app'`, per_diem null) → card shows "None"; approve without touching → `timesheet_entries.per_diem = 0`. Second row: set ×0.5 in dropdown, approve → `per_diem = 0.5`, `hours = 0`, `is_day_off = true`. `npm run build` passes.
- [ ] **Step 5: Commit** `src/components/SmsReview.jsx` — "SMS Review: per diem on day-off requests".

### Task 3: Timesheets tab — "Day off" in Add Manual Timesheet

**Files:**
- Modify: `src/components/AdminDashboard.jsx` (`manualFields` state ~line 145 and reset ~line 616; `saveManualEntry` ~line 556; form ~line 1531)

**Interfaces:**
- Consumes: `submitDayOff` (Task 1).

- [ ] **Step 1: State.** Add `is_day_off: false` to `manualFields` initial value and to the reset after save.
- [ ] **Step 2: Form.** A "Day off (no work — per diem only)" checkbox under Employee/Date. When checked: hide Time In, Time Out, Lunch, Jobs and Supplies; keep Per Diem; Save button text "Send Day Off to SMS Review".
- [ ] **Step 3: Save.** At the top of `saveManualEntry`, after the employee/date check: if `manualFields.is_day_off`, call `submitDayOff(supabase, { employeeId, workDate, perDiem: Number(manualFields.per_diem) || 0, adminName: getAdminName() })`; on `error` alert `error.message` and keep the form open; on success reload, close, reset (no celebration, no job validation). Unchecked path unchanged.
- [ ] **Step 4: Verify on dev:** day off ×1 for Jim (dev) on a date with no entries → appears in SMS Review as day off ×1 → approve → Timesheets tab shows "Day off", 0 h, PD ×1; Payroll tab and Weekly Summary count the per diem for that day. Repeat on a date with approved hours → refused with the hours message. Repeat on the same day-off date → refused. Untick Day off → normal manual entry still requires a job.
- [ ] **Step 5: Verify the existing edit box:** open the approved day-off row in Timesheets → change PD to ×0.5 → save succeeds and shows ×0.5. If it fails, fix in `saveEdit` and note it in the commit.
- [ ] **Step 6: Commit** `src/components/AdminDashboard.jsx` — "Timesheets: office can add a day off with per diem".

### Task 5: Techs claim per diem on their own day off (app + text)

**Files:**
- Create: `supabase/functions/sms-timesheet/dayOff.js` (pure, importable by the bot and by `node:test`, like `entries.js`)
- Modify: `supabase/functions/sms-timesheet/index.ts` (day-off branch ~line 1648)
- Modify: `src/employee/EmployeeHome.jsx` (`markDayOff` ~line 239, day-off hint ~line 726, Day Off button ~line 768)
- Test: `scripts/test-day-off.mjs`

**Interfaces:**
- Produces: `parseDayOffText(msgLower: string) -> null | { perDiemLocation: string }` — `null` = not this rule (fall through to today's handling); `perDiemLocation` is `'none'` or the claimed place / `'PD claimed'`.

- [ ] **Step 1: Failing tests** for `parseDayOffText`: `'day off'` → `{perDiemLocation:'none'}`; `'day off pd'`, `'day off, per diem'`, `'day off p.d.'` → `'PD claimed'`; `'day off pd lisbon'` → `'lisbon'` (bot keeps original casing — see Step 3); `'day off hotel in lisbon'` → `'hotel in lisbon'`; `'day off no pd'`, `'day off no per diem'` → `'none'`; `'day off tomorrow'`, `'day off friday pd'`, `'taking a day off'` → `null`. Rule: after `day off` + optional punctuation, the rest must be empty, a no-PD phrase, or start with `pd`/`p.d.`/`per diem`/`hotel`/`staying`; a date word (today/tomorrow/yesterday/weekday names) anywhere → `null`.
- [ ] **Step 2: Run** `node --test scripts/test-day-off.mjs` — FAIL.
- [ ] **Step 3: Implement** `parseDayOffText`; bot calls it on `msgLower` but takes the place text from `msgBody` at the same offset so "Lisbon" keeps its capital. Replace the exact `msgLower === 'day off'` test with `parseDayOffText(msgLower)` (same media/employee guards); insert `per_diem_location`; reply appends ", with per diem" when not `'none'`. Run tests — PASS.
- [ ] **Step 4: App.** Day Off button opens an inline box on that day card (no `confirm()`): "Per diem?" text input (placeholder `"none" or hotel / city`) + **Send day off** + Cancel. `markDayOff(ymd, perDiemLocation)` writes `per_diem_location` (`trim() || 'none'`) on insert and on the existing-row update. Pending day-off hint shows `· PD: <place>` when not none.
- [ ] **Step 5: Verify on dev:** deploy bot to dev (`supabase functions deploy sms-timesheet --project-ref giwexoouqxioxkjhoxoe --no-verify-jwt`); POST `{from_phone, body}` for Jim's dev phone: `day off pd Lisbon` → reply mentions per diem, row has `per_diem_location='Lisbon'`, SMS Review card shows ×1; `day off` → none; `day off tomorrow` → not a day off row. App: Day Off with "Halifax" → card shows ×1 + Halifax; approve → PD 1. `npm run build` passes.
- [ ] **Step 6: Commit** — "Techs can claim per diem on their day off".

### Task 4 (last): Clean up and hand over

- [ ] **Step 1:** Delete every dev test row (submissions and timesheet_entries for Jim's dev record on the test dates); confirm 0 left with a psql count.
- [ ] **Step 2:** Leave the dev app running for Jim's check; give him the URL and what to try.
- [ ] **Step 3:** After Jim's OK on dev: draft the note to Niki in chat (plain steps matching the real screens) for Jim to send himself; PR; merge only on Jim's OK.
