/**
 * Generates the small grid thumbnail (gear_photos.thumb_path) for every photo
 * that doesn't have one yet, and records sha256 of the original where missing.
 *
 * Originals are NEVER modified or overwritten — they may be evidence years
 * from now. This only reads them, writes a new file under thumbs/, and updates
 * the row. Videos and anything sharp can't decode (HEIC without libheif) are
 * skipped and left for the grid to fall back to the original.
 *
 * Covers two cases the in-app upload can't: photos that existed before
 * thumbnails shipped (one-time), and photos texted in via MMS, which the
 * sms-timesheet edge function stores without a thumbnail (nightly, see
 * .github/workflows/thumbnail-gear-photos.yml).
 *
 *   node --env-file=.env.local scripts/backfill-thumbs.mjs            # do it
 *   node --env-file=.env.local scripts/backfill-thumbs.mjs --dry-run  # report only
 *
 * Reads SUPABASE_URL / SUPABASE_ANON_KEY, falling back to the VITE_-prefixed
 * names the app uses in .env.local. The anon key is enough: the app itself
 * uploads to gear-photos and updates gear_photos rows with it.
 */
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (or run with --env-file=.env.local).')
  process.exit(1)
}
const DRY_RUN = process.argv.includes('--dry-run')

// Keep in sync with THUMB_* in src/utils/media.js so backfilled and
// in-app thumbnails look the same in the grid.
const THUMB_MAX_DIMENSION = 480
const THUMB_JPEG_QUALITY = 80
const VIDEO_EXT_RE = /\.(mp4|mov|webm|3gp|m4v)$/i
const thumbPathFor = (storagePath) => `thumbs/${storagePath.replace(/\.[^.]+$/, '')}.jpg`

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const bucket = supabase.storage.from('gear-photos')

const { data: rows, error } = await supabase.schema('Cores').from('gear_photos')
  .select('id, storage_path, thumb_path, sha256, file_size_bytes')
  .is('thumb_path', null)
  .order('created_at', { ascending: false })
if (error) { console.error('Query failed:', error.message); process.exit(1) }

const candidates = rows.filter(r => !VIDEO_EXT_RE.test(r.storage_path))
console.log(`${rows.length} photos without a thumbnail (${rows.length - candidates.length} video, skipped)${DRY_RUN ? ' — DRY RUN' : ''}`)

let done = 0, failed = 0, originalBytes = 0, thumbBytes = 0
for (const row of candidates) {
  const label = row.storage_path
  const { data: blob, error: dlError } = await bucket.download(row.storage_path)
  if (dlError || !blob) { console.log(`  skip  ${label} — download failed: ${dlError?.message || 'no data'}`); failed++; continue }
  const original = Buffer.from(await blob.arrayBuffer())
  originalBytes += original.length

  let thumb
  try {
    // .rotate() with no args applies the EXIF orientation; the thumbnail
    // itself carries no EXIF so the pixels have to be upright already.
    // failOn 'none': a slightly corrupt phone JPEG (stray bytes before a
    // marker) still decodes fine visually — don't refuse it a thumbnail.
    thumb = await sharp(original, { failOn: 'none' }).rotate()
      .resize(THUMB_MAX_DIMENSION, THUMB_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#fff' })
      .jpeg({ quality: THUMB_JPEG_QUALITY })
      .toBuffer()
  } catch (e) {
    console.log(`  skip  ${label} — can't decode (${e.message.split('\n')[0]})`); failed++; continue
  }
  thumbBytes += thumb.length

  const sha256 = row.sha256 || (await crypto.subtle.digest('SHA-256', original).then(d => Buffer.from(d).toString('hex')))
  const thumb_path = thumbPathFor(row.storage_path)
  console.log(`  ${DRY_RUN ? 'would' : 'thumb'} ${label}  ${(original.length / 1024).toFixed(0)} KB → ${(thumb.length / 1024).toFixed(0)} KB`)
  if (DRY_RUN) { done++; continue }

  const { error: upError } = await bucket.upload(thumb_path, thumb, { contentType: 'image/jpeg' })
  if (upError) {
    // Two gear_photos rows can point at the same file (a doubled-up MMS). The
    // first row's run already made this thumbnail; the bucket has no UPDATE
    // policy so re-uploading is refused — just link the existing one.
    const { data: existing } = await bucket.download(thumb_path)
    if (!existing) { console.log(`  fail  ${label} — thumb upload: ${upError.message}`); failed++; continue }
  }
  const { error: rowError } = await supabase.schema('Cores').from('gear_photos')
    .update({ thumb_path, ...(row.sha256 ? {} : { sha256 }) }).eq('id', row.id)
  if (rowError) { console.log(`  fail  ${label} — row update: ${rowError.message}`); failed++; continue }
  done++
}

console.log(`\n${DRY_RUN ? 'Would generate' : 'Generated'} ${done} thumbnails, ${failed} skipped/failed. Originals read: ${(originalBytes / 1048576).toFixed(1)} MB, thumbnails: ${(thumbBytes / 1048576).toFixed(1)} MB.`)
process.exit(failed > 0 && done === 0 ? 1 : 0)
