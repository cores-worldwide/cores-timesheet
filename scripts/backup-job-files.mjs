/**
 * Plans and stages the Google Drive copy of the private job-files bucket (see
 * .github/workflows/backup-to-drive.yml):
 *
 *   job-files/
 *     file-index.csv                         every file: job, folder, status, sha256, bucket path
 *     by-job/<job# description — customer>/[<folder>/]<date> <file name>
 *     _other (no Job Files record)/<bucket path>
 *
 *   node scripts/backup-job-files.mjs <drive-listing.txt> <prev-index.csv> <out-dir>
 *   node scripts/backup-job-files.mjs --dry-run      counts only, no downloads, no files written
 *
 * A file keeps the Drive path it was first backed up to. If the office later
 * moves or removes it, the index shows the current job and status and the copy
 * stays where it is. Nothing here deletes from Drive, and only new files cost
 * egress. Uses the anon key (VITE_* names work too).
 */
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const INDEX_NAME = 'file-index.csv'
const COLUMNS = ['status', 'drive_path', 'job_number', 'job_description', 'customer', 'vessel', 'folder', 'file_name', 'kind', 'filed_by', 'created_at', 'size_bytes', 'sha256', 'bucket_path']

const san = (s) => String(s ?? '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 100) || 'unnamed'
const jobFolder = (job) => {
  if (!job) return '_no job'
  const parts = [job.job_number, job.description].filter(Boolean).join(' ')
  return san(job.customers?.name ? `${parts} — ${job.customers.name}` : parts)
}

// Pure so it can be tested without Supabase or Drive.
export function planBackup({ rows, bucketFiles, prevIndex, inDrive }) {
  const prevByBucketPath = new Map(prevIndex.filter((r) => r.bucket_path && r.drive_path).map((r) => [r.bucket_path, r]))
  const inBucket = new Set(bucketFiles)
  const taken = new Set([...inDrive, ...prevIndex.map((r) => r.drive_path).filter(Boolean)])
  const claim = (path) => {
    if (!taken.has(path)) { taken.add(path); return path }
    const m = path.match(/^(.*?)(\.[^./]+)?$/)
    for (let n = 2; ; n++) { const alt = `${m[1]} (${n})${m[2] || ''}`; if (!taken.has(alt)) { taken.add(alt); return alt } }
  }
  const items = []
  const seen = new Set()
  const place = (bucketPath, wanted) => {
    const previous = prevByBucketPath.get(bucketPath)
    if (previous && inDrive.has(previous.drive_path)) return { drivePath: previous.drive_path, previous, download: false }
    // In the index but gone from Drive: copy again, to its old path if there is one.
    return { drivePath: previous?.drive_path || claim(wanted()), previous, download: true }
  }
  for (const r of rows) {
    if (seen.has(r.storage_path)) continue
    seen.add(r.storage_path)
    const missing = !inBucket.has(r.storage_path)
    const placed = place(r.storage_path, () => {
      const folder = r.folder ? `${san(r.folder)}/` : ''
      return `by-job/${jobFolder(r.jobs)}/${folder}${String(r.created_at || '').slice(0, 10)} ${san(r.file_name)}`
    })
    items.push({
      bucketPath: r.storage_path, drivePath: placed.drivePath,
      download: placed.download && !missing, expectedBytes: r.size_bytes ?? null,
      index: {
        status: missing ? 'MISSING FROM BUCKET' : r.deleted_at ? 'removed in app' : 'current',
        drive_path: placed.drivePath, job_number: r.jobs?.job_number || '', job_description: r.jobs?.description || '',
        customer: r.jobs?.customers?.name || '', vessel: r.jobs?.vessels?.name || '', folder: r.folder || '',
        file_name: r.file_name, kind: r.kind, filed_by: r.filed_by_name || '', created_at: r.created_at || '',
        size_bytes: r.size_bytes ?? '', sha256: placed.previous?.sha256 || '', bucket_path: r.storage_path,
      },
    })
  }
  for (const p of bucketFiles) {
    if (seen.has(p)) continue
    seen.add(p)
    const placed = place(p, () => `_other (no Job Files record)/${p}`)
    items.push({
      bucketPath: p, drivePath: placed.drivePath, download: placed.download, expectedBytes: null,
      index: { status: 'no Job Files record', drive_path: placed.drivePath, sha256: placed.previous?.sha256 || '', bucket_path: p },
    })
  }
  // Earlier entries with no row and no bucket file stay findable. Copies are never deleted.
  for (const r of prevIndex) {
    if (r.bucket_path && !seen.has(r.bucket_path) && r.drive_path) {
      items.push({ bucketPath: r.bucket_path, drivePath: r.drive_path, download: false, expectedBytes: null, index: { ...r, status: 'gone from app' } })
    }
  }
  return items
}

export function toCsv(rows) {
  const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => cell(r[c])).join(','))].join('\n') + '\n'
}
export function parseCsv(text) {
  if (!text.trim()) return []
  const rows = [], cur = []; let field = '', q = false
  const endRow = () => { cur.push(field); field = ''; rows.push(cur.splice(0)) }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false } else field += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { cur.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; endRow() }
    else field += ch
  }
  if (field || cur.length) endRow()
  const [header, ...body] = rows
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}

async function main() {
  const dryRun = process.argv[2] === '--dry-run'
  const [listingFile, prevIndexFile, outDir] = process.argv.slice(2)
  if (!dryRun && (!listingFile || !prevIndexFile || !outDir)) {
    console.error('usage: backup-job-files.mjs <drive-listing.txt> <prev-index.csv> <out-dir> | --dry-run')
    process.exit(1)
  }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (or the VITE_ names).'); process.exit(1) }
  const supabase = createClient(url, key)
  const bucket = supabase.storage.from('job-files')

  const withRetry = async (what, fn, attempts = 4) => {
    for (let i = 1; ; i++) {
      const { data, error } = await fn()
      if (!error) return data
      if (i === attempts) throw new Error(`${what}: ${error.message}`)
      await new Promise((r) => setTimeout(r, 1500 * i))
    }
  }
  const listBucket = async (prefix = '') => {
    const files = []
    for (let offset = 0; ; offset += 1000) {
      const data = await withRetry(`list ${prefix || '/'}`, () => bucket.list(prefix, { limit: 1000, offset }))
      for (const entry of data) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.id) files.push(path)
        else files.push(...await listBucket(path))
      }
      if (data.length < 1000) break
    }
    return files
  }
  const readRows = async () => {
    const all = []
    for (let from = 0; ; from += 1000) {
      const page = await withRetry('job_files', () => supabase.schema('Cores').from('job_files')
        .select('storage_path, file_name, kind, folder, size_bytes, filed_by_name, created_at, deleted_at, jobs(job_number, description, customers(name), vessels(name))')
        .order('id').range(from, from + 999))
      all.push(...page)
      if (page.length < 1000) return all
    }
  }

  const inDrive = new Set(dryRun ? [] : (await readFile(listingFile, 'utf8').catch(() => '')).split('\n').map((s) => s.trim()).filter(Boolean))
  const prevIndex = dryRun ? [] : parseCsv(await readFile(prevIndexFile, 'utf8').catch(() => ''))
  const [rows, bucketFiles] = await Promise.all([readRows(), listBucket()])
  const items = planBackup({ rows, bucketFiles, prevIndex, inDrive })
  const toDownload = items.filter((i) => i.download)
  const missing = items.filter((i) => i.index.status === 'MISSING FROM BUCKET')
  const unmatched = items.filter((i) => i.index.status === 'no Job Files record')
  console.log(`${rows.length} records, ${bucketFiles.length} bucket files: ${toDownload.length} to download, ${missing.length} missing from bucket, ${unmatched.length} with no record`)
  if (dryRun) {
    const known = rows.reduce((n, r) => n + (Number(r.size_bytes) || 0), 0)
    console.log(`Recorded size: ${(known / 1048576).toFixed(1)} MB. Dry run: nothing downloaded or written.`)
    return
  }

  let failed = 0, bytes = 0
  for (const item of toDownload) {
    try {
      const data = await withRetry(`download ${item.bucketPath}`, () => bucket.download(item.bucketPath))
      const buf = Buffer.from(await data.arrayBuffer())
      if (item.expectedBytes != null && Number(item.expectedBytes) !== buf.length) throw new Error(`size ${buf.length}, expected ${item.expectedBytes}`)
      const dest = join(outDir, item.drivePath)
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, buf)
      item.index.sha256 = createHash('sha256').update(buf).digest('hex')
      bytes += buf.length
    } catch (e) {
      failed++
      item.index.status = 'BACKUP FAILED'
      console.log(`  fail  ${e.message}`)
    }
  }
  await mkdir(outDir, { recursive: true })
  await writeFile(join(outDir, INDEX_NAME), toCsv(items.map((i) => i.index)))
  console.log(`Downloaded ${toDownload.length - failed} new files (${(bytes / 1048576).toFixed(1)} MB), ${failed} failed.`)
  // A missing file is a real problem to look at, but it must not stop the rest being copied.
  process.exitCode = failed > 0 || missing.length > 0 ? 1 : 0
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
