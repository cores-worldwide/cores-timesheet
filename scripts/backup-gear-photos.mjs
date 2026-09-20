/**
 * Plans and stages the Google Drive copy of the gear-photos bucket, laid out
 * for humans (see .github/workflows/backup-to-drive.yml):
 *
 *   gear-photos/
 *     photo-index.csv                          every photo: job, vessel, who,
 *                                              when, type, note, sha256, bucket path
 *     by-job/<job# description — customer>/    <date> <HH-MM> <employee> (<type>).jpg
 *     by-job/_no job assigned/                 untagged photos
 *     vessels/<vessel name>/                   vessel photos
 *     _orphaned (no app record)/<bucket path>  files in the bucket with no row
 *     _thumbnails (regenerable)/               grid derivatives, kept out of the way
 *
 *   node scripts/backup-gear-photos.mjs <drive-listing.txt> <prev-index.csv> <out-dir> <moves.tsv>
 *
 * <drive-listing.txt>  what's in Drive now (`rclone lsf -R --files-only`)
 * <prev-index.csv>     last run's photo-index.csv (may not exist yet)
 * <out-dir>            new files are downloaded here at their Drive path, plus
 *                      the regenerated photo-index.csv, for `rclone copy`
 * <moves.tsv>          "from<TAB>to" lines for `rclone moveto` — a photo already
 *                      in Drive under an old path (the original date layout, or a
 *                      job it was since re-tagged away from) is moved server-side,
 *                      never re-downloaded
 *
 * Copy/move only: nothing here ever deletes from Drive. A photo deleted in the
 * app stays where it was and is listed in the index as "deleted from app".
 * Only new files cost egress; the bucket is never re-downloaded.
 *
 * Uses the anon key (VITE_* names from .env.local work too).
 */
import { createClient } from '@supabase/supabase-js'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const [listingFile, prevIndexFile, outDir, movesFile] = process.argv.slice(2)
if (!listingFile || !prevIndexFile || !outDir || !movesFile) {
  console.error('usage: backup-gear-photos.mjs <drive-listing.txt> <prev-index.csv> <out-dir> <moves.tsv>')
  process.exit(1)
}
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const bucket = supabase.storage.from('gear-photos')

// The storage API throws the odd 504 across a few hundred sequential calls;
// a nightly job should ride that out, not fail on it.
async function withRetry(what, fn, attempts = 4) {
  for (let i = 1; ; i++) {
    const { data, error } = await fn()
    if (!error) return data
    if (i === attempts) throw new Error(`${what}: ${error.message}`)
    await new Promise(r => setTimeout(r, 1500 * i))
  }
}

// Storage list() is one folder level at a time.
async function listBucket(prefix = '') {
  const files = []
  for (let offset = 0; ; offset += 1000) {
    const data = await withRetry(`list ${prefix || '/'}`, () => bucket.list(prefix, { limit: 1000, offset }))
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id) files.push(path)          // files have an id; folders don't
      else files.push(...await listBucket(path))
    }
    if (data.length < 1000) break
  }
  return files
}

// ── Inputs ──────────────────────────────────────────────────────────────────
const inDrive = new Set((await readFile(listingFile, 'utf8').catch(() => '')).split('\n').map(s => s.trim()).filter(Boolean))
const prevIndex = parseCsv(await readFile(prevIndexFile, 'utf8').catch(() => ''))
const prevDrivePathByBucketPath = new Map(prevIndex.map(r => [r.bucket_path, r.drive_path]).filter(([b, d]) => b && d))

const [bucketFiles, rows, vessels] = await Promise.all([
  listBucket(),
  withRetry('gear_photos', () => supabase.schema('Cores').from('gear_photos')
    .select('id, storage_path, sha256, file_size_bytes, work_date, created_at, photo_type, note, from_phone, jobs(job_number, description, customers(name), vessels(name)), employees(name)')
    .order('created_at')),
  withRetry('vessels', () => supabase.schema('Cores').from('vessels').select('id, name')),
])
const vesselName = Object.fromEntries(vessels.map(v => [v.id, v.name]))

// ── Desired Drive path for every bucket file ────────────────────────────────
const san = (s) => String(s ?? '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 100)
const localTime = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Halifax', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
const takenAt = (iso) => {
  const p = Object.fromEntries(localTime.formatToParts(new Date(iso)).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}-${p.minute}`, display: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}` }
}
const jobFolder = (job) => {
  if (!job) return '_no job assigned'
  const parts = [job.job_number, job.description].filter(Boolean).join(' ')
  return san(job.customers?.name ? `${parts} — ${job.customers.name}` : parts)
}

const taken = new Set()               // Drive paths claimed so far (uniqueness)
const claim = (path) => {
  if (!taken.has(path)) { taken.add(path); return path }
  const m = path.match(/^(.*?)(\.[^.]+)?$/)
  for (let n = 2; ; n++) { const alt = `${m[1]} (${n})${m[2] || ''}`; if (!taken.has(alt)) { taken.add(alt); return alt } }
}

const plan = []                       // { bucketPath, drivePath, index: {...} }
const seenBucketPath = new Set()
for (const r of rows) {
  if (seenBucketPath.has(r.storage_path)) continue   // two rows can share one file (doubled-up MMS)
  seenBucketPath.add(r.storage_path)
  const ext = (r.storage_path.split('.').pop() || 'jpg').toLowerCase()
  const t = takenAt(r.created_at)
  const who = san(r.employees?.name || r.from_phone || 'unknown')
  const drivePath = claim(`by-job/${jobFolder(r.jobs)}/${t.date} ${t.time} ${who} (${r.photo_type || 'untagged'}).${ext}`)
  plan.push({ bucketPath: r.storage_path, drivePath, index: {
    status: 'current', drive_path: drivePath, job_number: r.jobs?.job_number || '', job_description: r.jobs?.description || '',
    customer: r.jobs?.customers?.name || '', vessel: r.jobs?.vessels?.name || '', employee: r.employees?.name || '',
    work_date: r.work_date, taken_at_atlantic: t.display, photo_type: r.photo_type || '', note: r.note || '',
    sha256: r.sha256 || '', file_size_bytes: r.file_size_bytes ?? '', bucket_path: r.storage_path,
  } })
}
for (const p of bucketFiles) {
  if (seenBucketPath.has(p)) continue
  if (p.startsWith('thumbs/')) { plan.push({ bucketPath: p, drivePath: claim(`_thumbnails (regenerable)/${p.slice('thumbs/'.length)}`), index: null }); continue }
  const v = p.match(/^vessels\/([^/]+)\/(.+)$/)
  const drivePath = v
    ? claim(`vessels/${san(vesselName[v[1]] || v[1])}/${v[2]}`)
    : claim(`_orphaned (no app record)/${p}`)
  plan.push({ bucketPath: p, drivePath, index: v ? null : {
    status: 'orphaned file', drive_path: drivePath, job_number: '', job_description: '', customer: '', vessel: '', employee: '',
    work_date: p.split('/')[0], taken_at_atlantic: '', photo_type: '', note: '', sha256: '', file_size_bytes: '', bucket_path: p,
  } })
}

// ── Reconcile against what Drive already has ────────────────────────────────
const moves = [], toDownload = []
let inPlace = 0
const accounted = new Set()
for (const item of plan) {
  if (inDrive.has(item.drivePath)) { inPlace++; accounted.add(item.drivePath); continue }
  const from = [prevDrivePathByBucketPath.get(item.bucketPath), item.bucketPath].find(c => c && inDrive.has(c) && !accounted.has(c))
  if (from) { moves.push([from, item.drivePath]); accounted.add(from); continue }
  toDownload.push(item)
}
// Anything in Drive we didn't account for is a photo since deleted in the app
// (or a stray) — it stays put, and goes in the index so it can still be found.
const leftovers = [...inDrive].filter(p => !accounted.has(p) && p !== 'photo-index.csv')
const prevByDrivePath = new Map(prevIndex.map(r => [r.drive_path, r]))

console.log(`${plan.length} files in bucket → ${inPlace} already in place, ${moves.length} to move within Drive, ${toDownload.length} to download; ${leftovers.length} Drive files no longer in the app`)

// ── Downloads ───────────────────────────────────────────────────────────────
let bytes = 0, failed = 0
for (const item of toDownload) {
  let data
  try { data = await withRetry(`download ${item.bucketPath}`, () => bucket.download(item.bucketPath)) }
  catch (e) { console.log(`  fail  ${e.message}`); failed++; continue }
  const dest = join(outDir, item.drivePath)
  await mkdir(dirname(dest), { recursive: true })
  const buf = Buffer.from(await data.arrayBuffer())
  await writeFile(dest, buf)
  bytes += buf.length
  console.log(`  new   ${item.drivePath}  ${(buf.length / 1024).toFixed(0)} KB`)
}
for (const [from, to] of moves) console.log(`  move  ${from}  →  ${to}`)
await writeFile(movesFile, moves.map(([f, t]) => `${f}\t${t}`).join('\n') + (moves.length ? '\n' : ''))

// ── Index ───────────────────────────────────────────────────────────────────
const columns = ['status', 'drive_path', 'job_number', 'job_description', 'customer', 'vessel', 'employee', 'work_date', 'taken_at_atlantic', 'photo_type', 'note', 'sha256', 'file_size_bytes', 'bucket_path']
const indexRows = plan.filter(i => i.index).map(i => i.index)
for (const p of leftovers) {
  const prev = prevByDrivePath.get(p)
  indexRows.push(prev ? { ...prev, status: 'deleted from app', drive_path: p } : { status: 'deleted from app', drive_path: p, bucket_path: '' })
}
indexRows.sort((a, b) => (a.job_number || '~').localeCompare(b.job_number || '~') || String(a.taken_at_atlantic).localeCompare(String(b.taken_at_atlantic)))
await mkdir(outDir, { recursive: true })
await writeFile(join(outDir, 'photo-index.csv'), toCsv(columns, indexRows))

console.log(`\nDownloaded ${toDownload.length - failed} new files (${(bytes / 1048576).toFixed(1)} MB), ${failed} failed; ${moves.length} moves planned; index has ${indexRows.length} rows.`)
process.exit(failed > 0 ? 1 : 0)

// ── CSV helpers ─────────────────────────────────────────────────────────────
function toCsv(cols, rows) {
  const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n') + '\n'
}
function parseCsv(text) {
  if (!text.trim()) return []
  const rows = [], cur = []; let field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false } else field += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { cur.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; cur.push(field); field = ''; rows.push(cur.splice(0)) }
    else field += ch
  }
  if (field || cur.length) { cur.push(field); rows.push(cur.splice(0)) }
  const [header, ...body] = rows
  return body.filter(r => r.length > 1).map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}
