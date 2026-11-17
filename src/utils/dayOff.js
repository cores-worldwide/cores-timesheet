// Day off with per diem (Jim, 2026-11-17): techs on the road are owed per diem
// on days they don't work. Only a day marked "day off" can carry per diem
// without hours — a blank day is not a day off. Office-entered days off go to
// SMS Review like every other office entry, then Niki approves them.
// Pure helpers, no imports, so node:test can load them directly.

// The sms_submissions row for a day off the office enters for a tech.
export function dayOffSubmissionRow({ employeeId, workDate, perDiem = 0, adminName }) {
  const pd = Number(perDiem) || 0
  return {
    from_phone: 'admin-manual',
    employee_id: employeeId,
    work_date: workDate,
    is_day_off: true,
    entries: [],
    supplies: [],
    per_diem: pd,
    per_diem_location: pd > 0 ? 'Office entry' : 'none',
    status: 'submitted',
    admin_note: adminName ? `Entered manually by ${adminName}` : null,
  }
}

// Why a day off can't be added for this person and date, or null if it can.
// approvedEntries: their timesheet_entries rows for the date.
// pendingDayOff: a day-off request for the date is already waiting in SMS Review.
// Stat pay alone doesn't block — it isn't work.
export function dayOffConflict({ approvedEntries = [], pendingDayOff = false }) {
  if (approvedEntries.some(e => e.is_day_off)) return 'That date is already a day off.'
  const worked = approvedEntries
    .filter(e => !e.is_day_off && !e.is_stat_pay)
    .reduce((s, e) => s + (Number(e.hours) || 0), 0)
  if (worked > 0) return `That date already has ${worked} hours logged — a day off can't go on a day they worked.`
  if (pendingDayOff) return 'A day off for that date is already waiting in SMS Review.'
  return null
}
