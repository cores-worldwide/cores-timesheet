import test from 'node:test'
import assert from 'node:assert/strict'
import { draftEntries } from '../src/utils/draftEntries.js'
import { mergeEntries, parsedWorkEntries, unparsedWorkEntry } from '../supabase/functions/sms-timesheet/entries.js'

const stamp = '2026-11-04T15:00:00.000Z'
const note = 'Removed bearings and cleaned valve gear'
const entry = (job_number = '', hours = '', description = note) => ({ job_number, hours, description })

test('phone: notes survive with both job and hours blank', () => {
  assert.deepEqual(draftEntries([entry()]), [entry('Unknown', null)])
})
test('phone: selected job survives without hours or description', () => {
  assert.deepEqual(draftEntries([entry('4760', '', '')]), [entry('4760', null, '')])
})
test('phone: hours-only rows stay under Unknown, without changing the duration', () => {
  assert.deepEqual(draftEntries([entry('', '2.25', '')]), [entry('Unknown', 2.25, '')])
})
test('phone: untouched rows are omitted; explicit zero remains zero', () => {
  assert.deepEqual(draftEntries([entry('', '', ''), entry('4760', '0')]), [entry('4760', 0)])
})
test('phone: invalid hours cannot become invented payroll hours', () => {
  for (const hours of ['oops', '-2', Infinity]) assert.equal(draftEntries([entry('4760', hours)])[0].hours, null)
})
test('SMS: jobless notes stay Unknown even after a different job was reported', () => {
  const prior = [entry('4760', 2, 'Earlier work')]
  const result = mergeEntries(prior, [entry('', null)], stamp)
  assert.equal(result.length, 2)
  assert.deepEqual(result[0], prior[0])
  assert.equal(result[1].job_number, 'Unknown')
  assert.equal(result[1].hours, null)
  assert.equal(result[1].description, note)
})
test('SMS: supplied job number and note survive missing hours', () => {
  assert.deepEqual(mergeEntries([], [entry('4760', null)], stamp), [{ ...entry('4760', null), last_mentioned_at: stamp }])
})
test('SMS: job-only mentions are retained, empty parser objects are not entries', () => {
  assert.equal(mergeEntries([], [entry('4760', null, '')], stamp)[0].job_number, '4760')
  assert.deepEqual(mergeEntries([], [{}], stamp), [])
})
test('SMS: later explicit hours fill the same job without erasing the note', () => {
  const before = mergeEntries([], [entry('4760', null)], stamp)
  const after = mergeEntries(before, [entry('4760', 3, '')], stamp)
  assert.equal(after.length, 1)
  assert.equal(after[0].hours, 3)
  assert.equal(after[0].description, note)
  assert.equal(before[0].hours, null, 'merging must not mutate prior data')
})
test('SMS: explicit corrections keep notes, additive hours still add', () => {
  let result = mergeEntries([entry('9999', 2)], [{ job_number: '4760', corrects_job_number: '9999' }], stamp)
  assert.equal(result[0].job_number, '4760')
  result = mergeEntries(result, [entry('4760', 1, 'Additional work')], stamp)
  assert.equal(result[0].hours, 3)
  result = mergeEntries(result, [{ ...entry('4760', 2, ''), replace_hours: true }], stamp)
  assert.equal(result[0].hours, 2)
  assert.equal(result[0].description, `${note}; Additional work`)
})
test('SMS: a later job mention never silently moves Unknown work', () => {
  const result = mergeEntries([entry('Unknown', null)], [entry('4760', null, 'Different work')], stamp)
  assert.equal(result.length, 2)
  assert.equal(result[0].job_number, 'Unknown')
  assert.equal(result[0].description, note)
})
test('SMS: parser omissions retain the original prose and explicit job', () => {
  assert.deepEqual(parsedWorkEntries({ entries: [] }, note), [entry('Unknown', null)])
  assert.deepEqual(parsedWorkEntries({ entries: [{}] }, note), [entry('Unknown', null)])
  assert.equal(unparsedWorkEntry(`4760 ${note}`).job_number, '4760')
  assert.equal(unparsedWorkEntry(`Work on job #4760: ${note}`).job_number, '4760')
  assert.equal(unparsedWorkEntry(note).hours, null)
})
test('SMS: incomplete parsing of a mixed shift and work note retains its prose', () => {
  const message = `In 7, out 3, ${note}`
  assert.equal(parsedWorkEntries({ entries: [], time_in: '07:00', stated_time_out: '15:00' }, message)[0].description, message)
})
test('SMS: shift-only, supply-only and negative follow-up replies do not invent work', () => {
  assert.deepEqual(parsedWorkEntries({ time_in: '07:00', stated_time_out: '15:00', lunch_minutes: 30, per_diem_location: 'none' }, 'In 7, out 3, lunch 30, no PD'), [])
  assert.deepEqual(parsedWorkEntries({ per_diem_location: 'none' }, 'none'), [])
  assert.deepEqual(parsedWorkEntries({ supplies: [{ supply_name: 'rags' }] }, 'used rags'), [])
})
