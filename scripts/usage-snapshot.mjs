#!/usr/bin/env node
// Nightly traffic & credit snapshot for Jim's private dashboard.
// Asks each outside service what was used and what it cost, and writes one row
// per day/service/metric to a JSON file that the workflow upserts into
// "Cores".usage_daily (see supabase/migrations/20261006200000_create_usage_daily.sql).
//
//   node scripts/usage-snapshot.mjs [out.json]      (default usage-rows.json)
//
// Each service runs only when its secret is set, so a missing key skips that
// service instead of breaking the others:
//   SUPABASE_ACCESS_TOKEN              Supabase request counts + egress estimate (from logs)
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN   Twilio balance + daily usage and price
//   ANTHROPIC_ADMIN_KEY                Claude API daily cost + tokens (sk-ant-admin...)
//
// DAYS (default 3) re-reads the last few complete days every night, so late
// provider data and a missed night fill themselves in.
// Exits 1 if any service failed, after writing whatever it did get.
import { writeFileSync } from 'node:fs'

const OUT = process.argv[2] || 'usage-rows.json'
const DAYS = Number(process.env.DAYS || 3)
const SUPABASE_REF = process.env.SUPABASE_REF || 'wgjuflwbkmgirhqoqfgp'
const TZ = 'America/Halifax'
// REST responses are streamed without a content-length, so their bytes aren't
// in the logs. Count them and assume this average size; the dashboard labels
// the result an estimate. Tune it if the Supabase usage page disagrees.
const REST_UNKNOWN_AVG_BYTES = Number(process.env.REST_UNKNOWN_AVG_BYTES || 20000)

const rows = []
const errors = []
const row = (day, service, metric, value, unit, source, extra = {}) =>
  rows.push({ day, service, metric, value: Number(value) || 0, unit, source,
    cost_usd: extra.cost_usd ?? null, details: extra.details ?? {} })

// --- dates ------------------------------------------------------------------
const ymd = (d, timeZone = 'UTC') =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const addDays = (day, n) => {
  const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return ymd(d)
}
// UTC instant of local midnight at the start of `day` in TZ.
function localMidnight(day) {
  const guess = new Date(`${day}T00:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).formatToParts(guess)
  const off = parts.find(p => p.type === 'timeZoneName').value.replace('GMT', '') || '+00:00'
  return new Date(`${day}T00:00:00${off}`)
}
const now = new Date()
const todayLocal = ymd(now, TZ)
const todayUtc = ymd(now)
const localDays = Array.from({ length: DAYS }, (_, i) => addDays(todayLocal, -(i + 1)))
// Twilio and Anthropic bucket by UTC day; those rows are keyed by UTC day.
const utcDays = Array.from({ length: DAYS }, (_, i) => addDays(todayUtc, -(i + 1)))

async function getJson(url, init, label) {
  const res = await fetch(url, init)
  const text = await res.text()
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

// --- Supabase (shared project: timesheets + BLD Inventory) -------------------
async function supabaseLogs(sql, start, end) {
  const q = new URLSearchParams({ sql, iso_timestamp_start: start.toISOString(), iso_timestamp_end: end.toISOString() })
  const body = await getJson(
    `https://api.supabase.com/v1/projects/${SUPABASE_REF}/analytics/endpoints/logs.all?${q}`,
    { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } }, 'supabase logs')
  if (body.error) throw new Error(`supabase logs: ${JSON.stringify(body.error).slice(0, 300)}`)
  return body.result || []
}

// Logs queries are capped at 24h; a DST day is 25h, so split into <=12h pieces.
function windows(day) {
  const start = localMidnight(day), end = localMidnight(addDays(day, 1))
  const out = []
  for (let t = start.getTime(); t < end.getTime(); t += 12 * 3600e3)
    out.push([new Date(t), new Date(Math.min(t + 12 * 3600e3, end.getTime()))])
  return out
}

const EDGE_SQL = `
select splitByChar('/', log_attributes['request.path'])[2] as area,
       splitByChar('/', log_attributes['request.path'])[4] as target,
       count() as reqs,
       countIf(log_attributes['response.headers.content_length'] = '') as unknown_len,
       sum(toUInt64OrZero(log_attributes['response.headers.content_length'])) as known_bytes
from logs where source = 'edge_logs'
group by area, target`
const FN_SQL = `
select log_attributes['request.pathname'] as path, count() as reqs
from logs where source = 'function_edge_logs' group by path`

async function supabase() {
  for (const day of localDays) {
    const areas = {}, tables = {}, functions = {}
    let restUnknown = 0, knownBytes = 0
    for (const [s, e] of windows(day)) {
      for (const r of await supabaseLogs(EDGE_SQL, s, e)) {
        const area = r.area || 'other', reqs = Number(r.reqs)
        areas[area] = (areas[area] || 0) + reqs
        knownBytes += Number(r.known_bytes)
        if (area === 'rest') {
          restUnknown += Number(r.unknown_len)
          tables[r.target || '?'] = (tables[r.target || '?'] || 0) + reqs
        }
      }
      for (const r of await supabaseLogs(FN_SQL, s, e))
        functions[r.path || '?'] = (functions[r.path || '?'] || 0) + Number(r.reqs)
    }
    const topTables = Object.fromEntries(Object.entries(tables).sort((a, b) => b[1] - a[1]).slice(0, 15))
    row(day, 'supabase', 'rest_requests', areas.rest || 0, 'requests', 'provider', { details: { by_table: topTables } })
    row(day, 'supabase', 'storage_requests', areas.storage || 0, 'requests', 'provider')
    row(day, 'supabase', 'auth_requests', areas.auth || 0, 'requests', 'provider')
    row(day, 'supabase', 'function_requests', Object.values(functions).reduce((a, b) => a + b, 0), 'requests', 'provider',
      { details: { by_function: functions } })
    row(day, 'supabase', 'egress_bytes', knownBytes + restUnknown * REST_UNKNOWN_AVG_BYTES, 'bytes', 'estimate', {
      details: { known_bytes: knownBytes, rest_responses_without_size: restUnknown, assumed_avg_bytes: REST_UNKNOWN_AVG_BYTES },
    })
  }
}

// --- Twilio ------------------------------------------------------------------
const TWILIO_CATEGORIES = {
  'sms-inbound': 'sms_inbound', 'sms-outbound': 'sms_outbound',
  'mms-inbound': 'mms_inbound', 'mms-outbound': 'mms_outbound',
  phonenumbers: 'phone_numbers', totalprice: 'cost',
}
async function twilio() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const init = { headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64') } }
  const base = `https://api.twilio.com/2010-04-01/Accounts/${sid}`
  const bal = await getJson(`${base}/Balance.json`, init, 'twilio balance')
  row(todayLocal, 'twilio', 'balance', bal.balance, bal.currency || 'USD', 'provider', { details: { as_of: now.toISOString() } })
  for (const day of utcDays) {
    const q = new URLSearchParams({ StartDate: day, EndDate: day, PageSize: '1000' })
    const body = await getJson(`${base}/Usage/Records/Daily.json?${q}`, init, 'twilio usage')
    for (const r of body.usage_records || []) {
      const metric = TWILIO_CATEGORIES[r.category]
      if (!metric) continue
      const value = metric === 'cost' ? r.price : r.count
      row(day, 'twilio', metric, value, metric === 'cost' ? (r.price_unit || 'usd') : r.count_unit, 'provider', {
        cost_usd: r.price != null ? Number(r.price) : null,
        details: { utc_day: true, usage: r.usage, usage_unit: r.usage_unit },
      })
    }
  }
}

// --- Claude API (Anthropic Admin API) ---------------------------------------
async function claude() {
  const init = { headers: { 'x-api-key': process.env.ANTHROPIC_ADMIN_KEY, 'anthropic-version': '2023-06-01',
    'User-Agent': 'CoresTimesheets-usage-snapshot/1.0' } }
  const start = `${utcDays[utcDays.length - 1]}T00:00:00Z`, end = `${todayUtc}T00:00:00Z`
  const cost = await getJson(`https://api.anthropic.com/v1/organizations/cost_report?${new URLSearchParams(
    { starting_at: start, ending_at: end })}`, init, 'claude cost')
  const usage = await getJson(`https://api.anthropic.com/v1/organizations/usage_report/messages?${new URLSearchParams(
    { starting_at: start, ending_at: end, bucket_width: '1d' })}`, init, 'claude usage')
  const dayOf = b => String(b.starting_at).slice(0, 10)
  const costs = {}
  for (const b of cost.data || [])
    costs[dayOf(b)] = (b.results || []).reduce((sum, r) => sum + Number(r.amount || 0), 0) / 100 // cents -> USD
  const tokens = {}
  for (const b of usage.data || []) {
    const t = tokens[dayOf(b)] = { input: 0, output: 0, cache_read: 0, cache_write: 0 }
    for (const r of b.results || []) {
      t.input += Number(r.uncached_input_tokens || 0)
      t.output += Number(r.output_tokens || 0)
      t.cache_read += Number(r.cache_read_input_tokens || 0)
      const cw = r.cache_creation || {}
      t.cache_write += Number(cw.ephemeral_5m_input_tokens || 0) + Number(cw.ephemeral_1h_input_tokens || 0)
    }
  }
  for (const day of utcDays) {
    const usd = costs[day] || 0, t = tokens[day] || { input: 0, output: 0, cache_read: 0, cache_write: 0 }
    row(day, 'claude', 'cost', usd, 'usd', 'provider', { cost_usd: usd, details: { utc_day: true } })
    row(day, 'claude', 'input_tokens', t.input + t.cache_read + t.cache_write, 'tokens', 'provider', { details: t })
    row(day, 'claude', 'output_tokens', t.output, 'tokens', 'provider')
  }
}

const services = [
  ['supabase', supabase, ['SUPABASE_ACCESS_TOKEN']],
  ['twilio', twilio, ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']],
  ['claude', claude, ['ANTHROPIC_ADMIN_KEY']],
]
const skipped = []
for (const [name, fn, needs] of services) {
  if (needs.some(k => !process.env[k])) { skipped.push(name); continue }
  try { await fn() } catch (e) { errors.push(`${name}: ${e.message}`) }
}

writeFileSync(OUT, JSON.stringify(rows))
console.log(JSON.stringify({ rows: rows.length, local_days: localDays, utc_days: utcDays, skipped, errors }, null, 2))
process.exit(errors.length ? 1 : 0)
