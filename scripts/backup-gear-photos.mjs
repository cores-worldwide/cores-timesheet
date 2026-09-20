/**
 * Downloads every file in the gear-photos bucket that isn't already backed up,
 * into a local folder for rclone to push to Google Drive (see
 * .github/workflows/backup-to-drive.yml).
 *
 *   node scripts/backup-gear-photos.mjs <already-backed-up.txt> <out-dir>
 *
 * <already-backed-up.txt> is one bucket path per line (what `rclone lsf -R
 * --files-only` printed for the Drive folder). Only paths not in it are
 * downloaded, so a nightly run costs a couple of MB of egress, not the whole
 * bucket — and the first run is the only one that pulls everything.
 *
 * Copy-only by design: nothing here (or in the workflow) ever deletes from
 * Drive, so a photo deleted in the app by mistake is still in the backup.
 *
 * Uses the anon key (VITE_* names from .env.local work too) — the bucket is
 * public-read and list is allowed by its SELECT policy.
 */
import { createClient } from '@supabase/supabase-js'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const [existingFile, outDir] = process.argv.slice(2)
if (!existingFile || !outDir) {
  console.error('usage: backup-gear-photos.mjs <already-backed-up.txt> <out-dir>')
  process.exit(1)
}
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  process.exit(1)
}

const existing = new Set(
  (await readFile(existingFile, 'utf8').catch(() => '')).split('\n').map(s => s.trim()).filter(Boolean)
)

const bucket = createClient(SUPABASE_URL, SUPABASE_KEY).storage.from('gear-photos')

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

// Storage list() is one folder level at a time; the bucket is laid out as
// <date>/<employee>/<file>, thumbs/<date>/<employee>/<file>, vessels/<id>/<file>.
async function listAll(prefix = '') {
  const files = []
  for (let offset = 0; ; offset += 1000) {
    const data = await withRetry(`list ${prefix || '/'}`, () => bucket.list(prefix, { limit: 1000, offset }))
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      // Folders come back with no id; files have one.
      if (entry.id) files.push({ path, size: entry.metadata?.size ?? 0 })
      else files.push(...await listAll(path))
    }
    if (data.length < 1000) break
  }
  return files
}

const all = await listAll()
const missing = all.filter(f => !existing.has(f.path))
console.log(`${all.length} files in bucket, ${existing.size} already in Drive, ${missing.length} to copy`)

let bytes = 0, failed = 0
for (const f of missing) {
  let data
  try { data = await withRetry(`download ${f.path}`, () => bucket.download(f.path)) }
  catch (e) { console.log(`  fail  ${e.message}`); failed++; continue }
  const dest = join(outDir, f.path)
  await mkdir(dirname(dest), { recursive: true })
  const buf = Buffer.from(await data.arrayBuffer())
  await writeFile(dest, buf)
  bytes += buf.length
  console.log(`  copy  ${f.path}  ${(buf.length / 1024).toFixed(0)} KB`)
}
console.log(`\nDownloaded ${missing.length - failed} files (${(bytes / 1048576).toFixed(1)} MB), ${failed} failed.`)
process.exit(failed > 0 ? 1 : 0)
