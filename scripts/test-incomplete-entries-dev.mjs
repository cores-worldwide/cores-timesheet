// Real dev bot + database tests. Synthetic fixtures are removed in finally.
// No Twilio requests, real texts, production URLs, or crew personal data.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { loadEnv } from 'vite'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { clearDevTestAudit } from './dev-test-cleanup.mjs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'
import { mergeEntries, parsedWorkEntries, unparsedWorkEntry } from '../supabase/functions/sms-timesheet/entries.js'

const env = loadEnv('development', new URL('..', import.meta.url).pathname, 'VITE_')
const url = env.VITE_SUPABASE_URL
if (new URL(url).hostname !== 'giwexoouqxioxkjhoxoe.supabase.co') throw Error('Refusing any database except cores-timesheets-dev')
const db = createClient(url, env.VITE_SUPABASE_ANON_KEY).schema('Cores')
const id = randomUUID()
const phone = `999${String(Date.now()).slice(-7)}`
const recordIds = new Set([id])
const requestHeaders = { 'Content-Type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY }
try { requestHeaders['x-test-secret'] = readFileSync(`${process.env.HOME}/.config/cores-dev/test-secret`, 'utf8').trim() } catch {}

async function check(result) {
  const { data, error } = await result
  if (error) throw Error(error.message)
  return data
}
async function sms(message) {
  const response = await fetch(`${url}/functions/v1/sms-timesheet`, {
    method: 'POST', headers: requestHeaders,
    body: JSON.stringify({ from_phone: phone, body: message }),
  })
  const result = await response.json()
  assert(response.ok && !result.error, `Dev bot failed (${response.status})`)
  const rows = await check(db.from('sms_submissions').select('id,entries,time_in,stated_time_out').eq('employee_id', id).eq('from_phone', phone))
  assert.equal(rows.length, 1)
  return rows[0]
}
async function clear() {
  const rows = await check(db.from('sms_submissions').select('id').eq('employee_id', id).eq('from_phone', phone))
  for (const row of rows) recordIds.add(row.id)
  await check(db.from('sms_submissions').delete().eq('employee_id', id).eq('from_phone', phone))
}

try {
  await check(db.from('employees').insert({ id, name: 'Incomplete Notes Test', phone, role: 'technician', active: true }))
  const note = 'Removed bearings and cleaned valve gear'
  let row = await sms(note)
  assert.equal(row.entries[0].job_number, 'Unknown')
  assert.equal(row.entries[0].hours, null)
  assert.match(row.entries[0].description, /bearings/i)
  console.log('PASS real SMS: description-only -> Unknown, hours null')
  await clear()

  row = await sms(`Job 4760 ${note}`)
  assert.equal(row.entries[0].job_number, '4760')
  assert.equal(row.entries[0].hours, null)
  assert.equal(row.entries[0].reg_hours, null)
  assert.match(row.entries[0].description, /bearings/i)
  console.log('PASS real SMS: explicit job + note retains job without hours')
  row = await sms('4760 2.5hrs additional inspection')
  assert.equal(row.entries.length, 1)
  assert.equal(row.entries[0].hours, 2.5)
  assert.match(row.entries[0].description, /bearings/i)
  assert.match(row.entries[0].description, /inspection/i)
  console.log('PASS real SMS: later hours preserve the earlier note')
  row = await sms('In 7am out 3pm lunch 30 no PD')
  assert.equal(row.entries[0].hours, 2.5)
  console.log('PASS real SMS: shift times do not overwrite explicit job hours')
  row = await sms('Painted loose brackets and packed tools')
  const unknown = row.entries.find(e => e.job_number === 'Unknown')
  assert(unknown)
  assert.equal(unknown.hours, null)
  assert.match(unknown.description, /brackets/i)
  assert.equal(row.entries.find(e => e.job_number === '4760').hours, 2.5)
  console.log('PASS real SMS: omitted job stays Unknown despite job history and shift bounds')
  await clear()

  row = await sms('In 7am out 3pm lunch 30 no PD. Job 4760 cleaned bearings. Job 4866 inspected liners.')
  assert.equal(row.entries.length, 2)
  assert.deepEqual(row.entries.map(e => e.job_number).sort(), ['4760', '4866'])
  assert(row.entries.every(e => e.hours === null && e.reg_hours === null && e.ot_hours === null))
  console.log('PASS real SMS: two jobs with shift bounds keep missing hours null')

  // Exercise the actual handler's parser-failure path against dev storage,
  // replacing only the paid parser HTTP call with a malformed response.
  let handler
  const source = readFileSync(new URL('../supabase/functions/sms-timesheet/index.ts', import.meta.url), 'utf8')
    .replace(/^import .*\n/gm, '')
  const context = {
    Deno: { env: { get: key => ({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: env.VITE_SUPABASE_ANON_KEY })[key] }, serve: fn => { handler = fn } },
    createClient, mergeEntries, parsedWorkEntries, unparsedWorkEntry,
    Request, Response, Headers, URL, URLSearchParams, TextEncoder, crypto: globalThis.crypto,
    setTimeout, clearTimeout, console: { log() {}, error() {} },
    EdgeRuntime: { waitUntil: promise => promise.catch(() => {}) },
    fetch: async (target, options) => String(target).startsWith('https://api.anthropic.com/')
      ? new Response(JSON.stringify({ content: [{ text: 'not parseable JSON' }] }), { status: 200 })
      : fetch(target, options),
  }
  vm.runInNewContext(stripTypeScriptTypes(source, { mode: 'strip' }), context)
  const failedParse = await handler(new Request(`${url}/functions/v1/sms-timesheet`, {
    method: 'POST', headers: requestHeaders,
    body: JSON.stringify({ from_phone: phone, body: 'Job 4760 kept this exact note during a parser outage' }),
  }))
  assert.equal(failedParse.status, 200)
  const failedResult = await failedParse.json()
  assert(failedResult.flags.some(flag => flag.includes('needs office review')))
  row = (await check(db.from('sms_submissions').select('entries').eq('employee_id', id)))[0]
  const preserved = row.entries.find(e => e.job_number === '4760')
  assert.match(preserved.description, /kept this exact note during a parser outage/)
  assert.equal(preserved.hours, null)
  console.log('PASS parser-failure handler: original text and supplied job saved to dev with hours null')
} finally {
  await clear()
  await check(db.from('employees').delete().eq('id', id))
  clearDevTestAudit(recordIds)
  const remaining = await check(db.from('sms_submissions').select('id').eq('from_phone', phone))
  assert.equal(remaining.length, 0)
  console.log('CLEANUP: synthetic employee, submissions and audit rows removed')
}
