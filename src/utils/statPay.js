import { supabase } from '../supabaseClient'

const cores = () => supabase.schema('Cores')

const toYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Pay week runs Thu–Wed
export function payWeekRange(ymd) {
  const start = new Date(ymd + 'T12:00:00')
  start.setDate(start.getDate() - ((start.getDay() - 4 + 7) % 7))
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return [toYMD(start), toYMD(end)]
}

// Any hours worked on a stat holiday are OT from the first minute
export async function isStatHoliday(ymd) {
  const { data } = await cores().from('stat_holidays').select('holiday_date').eq('holiday_date', ymd)
  return (data || []).length > 0
}

// Request the automatic 8-hr stat entry for every stat holiday in the pay
// week containing workDate — but only if the employee actually worked that
// week. This used to insert straight into timesheet_entries, fully approved,
// with nobody having reviewed it — same bug the 2026-08-26 manual-entry fix
// and the 2026-09-03 day-off fix closed for their own paths (see
// submitManualEntry above and 20260903100000_add_day_off_pending_review.sql).
// Confirmed in production for the 2026-09-07 Labour Day grants: they landed
// live and, because they were never linked to a submission, were stuck with
// no way to edit or revert them. Now it raises a pending sms_submissions row
// (is_stat_grant) instead — SmsReview's approve() creates the real
// timesheet_entries row only once Niki reviews and approves it.
// Idempotent: skips stat days the employee already has a stat-pay entry or a
// pending/rejected grant request for. Called after every path that creates
// or edits timesheet entries.
export async function ensureStatPay(employeeId, workDate) {
  if (!employeeId || !workDate) return
  const [weekStart, weekEnd] = payWeekRange(workDate)

  const { data: stats } = await cores().from('stat_holidays')
    .select('holiday_date, name')
    .gte('holiday_date', weekStart).lte('holiday_date', weekEnd)
  if (!stats || stats.length === 0) return

  // Eligibility: at least one real (non-stat-pay) entry in the pay week
  const { data: worked } = await cores().from('timesheet_entries')
    .select('id')
    .eq('employee_id', employeeId).eq('is_stat_pay', false)
    .gte('work_date', weekStart).lte('work_date', weekEnd)
    .limit(1)
  if (!worked || worked.length === 0) return

  for (const stat of stats) {
    const { data: existingEntry } = await cores().from('timesheet_entries')
      .select('id')
      .eq('employee_id', employeeId).eq('work_date', stat.holiday_date).eq('is_stat_pay', true)
      .limit(1)
    if (existingEntry && existingEntry.length > 0) continue

    // Already requested (pending, already approved-and-reopened, or already
    // decided by Niki) — don't re-request it on every subsequent approval in
    // the same pay week, and don't re-offer one she's already rejected.
    const { data: existingRequest } = await cores().from('sms_submissions')
      .select('id')
      .eq('employee_id', employeeId).eq('work_date', stat.holiday_date).eq('is_stat_grant', true)
      .limit(1)
    if (existingRequest && existingRequest.length > 0) continue

    const { error } = await cores().from('sms_submissions').insert({
      from_phone: 'system-stat-grant',
      employee_id: employeeId,
      work_date: stat.holiday_date,
      entries: [{ hours: 8, description: `Stat pay — ${stat.name}` }],
      status: 'submitted',
      is_stat_grant: true,
    })
    if (error) console.error(`Stat pay request failed for ${stat.holiday_date}: ${error.message}`)
  }
}

// Counterpart to ensureStatPay: if the employee no longer has any real
// (non-stat-pay) entries in the pay week containing workDate, the automatic
// stat entries in that week are unearned — remove them. Called after deletes
// and after edits that move an entry's date out of a week.
export async function cleanupStatPay(employeeId, workDate) {
  if (!employeeId || !workDate) return
  const [weekStart, weekEnd] = payWeekRange(workDate)

  const { data: worked } = await cores().from('timesheet_entries')
    .select('id')
    .eq('employee_id', employeeId).eq('is_stat_pay', false)
    .gte('work_date', weekStart).lte('work_date', weekEnd)
    .limit(1)
  if (worked && worked.length > 0) return

  const { error } = await cores().from('timesheet_entries')
    .delete()
    .eq('employee_id', employeeId).eq('is_stat_pay', true)
    .gte('work_date', weekStart).lte('work_date', weekEnd)
  if (error) console.error(`Stat pay cleanup failed for week of ${workDate}: ${error.message}`)

  // Also withdraw any still-pending stat-grant request for the week — no
  // sense asking Niki to approve stat pay for hours that no longer exist.
  const { error: reqError } = await cores().from('sms_submissions')
    .delete()
    .eq('employee_id', employeeId).eq('is_stat_grant', true)
    .in('status', ['submitted', 'collecting'])
    .gte('work_date', weekStart).lte('work_date', weekEnd)
  if (reqError) console.error(`Stat pay request cleanup failed for week of ${workDate}: ${reqError.message}`)
}
