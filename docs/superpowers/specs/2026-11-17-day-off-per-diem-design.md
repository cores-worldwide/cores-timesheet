# Per diem on a day off — design (2026-11-17)

## Why
Techs on the road are owed per diem on days they don't work. Today the only
way to put per diem on a day is to log it as work (job + hours), and the
approval check then blocks it for missing start/stop times. Approving a
tech's own Day Off always saves per diem 0, with no way to change it.

## Decided (Jim, 2026-11-17)
- Per diem without work is only allowed on a day marked **Day off**. A blank
  day (tech logged nothing) is not a day off and gets nothing.
- Techs usually don't mark days off, so **Niki marks the day off herself**
  when she knows, and sets the per diem.
- **Approach B:** the office's day off goes through SMS Review like every
  other office entry (the 2026-08-26 "no approval bypass" rule), then Niki
  approves it.

## Approaches considered
- **A. Straight onto the timesheet** — one step, but bypasses SMS Review;
  anyone with the office login could add paid per diem unchecked. Rejected.
- **B. Through SMS Review** — one extra click; keeps one approval gate and
  the "approved by" record for every paid day. **Picked.**

## What changes
1. **Timesheets tab → Add Manual Timesheet:** a "Day off" choice. When on,
   times and jobs are hidden and not required; Employee, Date and Per Diem
   stay. Saves an `sms_submissions` row: `is_day_off = true`, no entries,
   `per_diem` as chosen, `from_phone = 'admin-manual'`,
   `admin_note = 'Entered manually by <name>'`, status `submitted`.
   Refused if that person already has approved hours or a day off on that date.
2. **SMS Review, day-off card:** a Per Diem dropdown (same choices as the
   manual form: None, ×0.25, ×0.5, ×0.75, ×1). Shows "🏖️ Day off — per diem ×1"
   when set. Works for the tech's own Day Off requests too.
3. **Approve Day Off:** saves the day-off timesheet row with the card's
   per diem instead of a fixed 0.

## Not changing
- No database change (columns already exist). No bot change.
- Payroll / Weekly Summary / reports already add up per diem on rows with
  0 hours — builder to confirm on dev, not assume.
- Techs can't set per diem on their own Day Off; that stays the office's call.
- Editing per diem on an already-approved day off in the Timesheets tab
  (existing edit box) — builder to confirm it works; fix only if it doesn't.

## Done when (checked on dev)
- Niki adds a day off with ×1 per diem → appears in SMS Review → approve →
  Timesheets and Payroll show the day off with per diem ×1, 0 hours.
- A tech's Day Off request can be approved with per diem set.
- Adding a day off on a date with approved hours is refused with a clear message.
- A note for Niki explaining the steps is drafted for Jim (not sent).
