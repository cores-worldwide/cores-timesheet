import test from 'node:test'
import assert from 'node:assert/strict'
import { dayOffSubmissionRow, dayOffConflict } from '../src/utils/dayOff.js'

test('office day off: row goes to SMS Review with the chosen per diem', () => {
  assert.deepEqual(
    dayOffSubmissionRow({ employeeId: 'e1', workDate: '2026-11-15', perDiem: 1, adminName: 'Niki' }),
    {
      from_phone: 'admin-manual', employee_id: 'e1', work_date: '2026-11-15',
      is_day_off: true, entries: [], supplies: [], per_diem: 1,
      per_diem_location: 'Office entry', status: 'submitted',
      admin_note: 'Entered manually by Niki',
    })
})

test('office day off: no per diem and no name', () => {
  const row = dayOffSubmissionRow({ employeeId: 'e1', workDate: '2026-11-15', perDiem: 0 })
  assert.equal(row.per_diem, 0)
  assert.equal(row.per_diem_location, 'none')
  assert.equal(row.admin_note, null)
})

test('conflict: approved worked hours block a day off', () => {
  assert.match(dayOffConflict({ approvedEntries: [{ hours: '10.50', is_day_off: false }], pendingDayOff: false }), /already has 10.5 hours/)
})

test('conflict: an approved day off blocks another', () => {
  assert.match(dayOffConflict({ approvedEntries: [{ hours: '0', is_day_off: true }], pendingDayOff: false }), /already a day off/)
})

test('conflict: a pending day off blocks another', () => {
  assert.match(dayOffConflict({ approvedEntries: [], pendingDayOff: true }), /already waiting in SMS Review/)
})

test('no conflict: empty day, or stat pay only', () => {
  assert.equal(dayOffConflict({ approvedEntries: [], pendingDayOff: false }), null)
  assert.equal(dayOffConflict({ approvedEntries: [{ hours: 8, is_day_off: false, is_stat_pay: true }], pendingDayOff: false }), null)
})
