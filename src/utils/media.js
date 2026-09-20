// A gear_photos.storage_path can now point at a video (see 2026-08-18
// migration widening the bucket's allowed_mime_types) — this is the one
// place that decides "photo or video" so every thumbnail/lightbox agrees.
const VIDEO_EXT_RE = /\.(mp4|mov|webm|3gp|m4v)$/i

export function isVideoPath(path) {
  return VIDEO_EXT_RE.test(path || '')
}

// Originals are evidence — a reference photo may be produced in a dispute
// years after upload (Jim, 2026-09-20) — so the uploaded file is stored
// byte-for-byte as captured: never resized or re-encoded, EXIF intact. Egress
// (the real constraint, per the Sept 2026 Supabase Fair Use warning) is
// handled by a small separate derivative at THUMB path that grids display; the
// lightbox still opens the original. Grid tiles are ~240px wide, so 480px
// covers a 2x display.
const THUMB_MAX_DIMENSION = 480
const THUMB_JPEG_QUALITY = 0.8

export const thumbPathFor = (storagePath) => `thumbs/${storagePath.replace(/\.[^.]+$/, '')}.jpg`

// JPEG Blob, or null when no thumbnail can be made (video, GIF, or a format
// this browser can't decode such as HEIC in non-Safari) — callers then leave
// thumb_path null and grids fall back to the original.
export async function makeThumbnail(file) {
  if (!file || !file.type?.startsWith('image/') || file.type === 'image/gif') return null
  try {
    // The derivative carries no EXIF, so bake the rotation into its pixels.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, THUMB_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    // JPEG has no alpha — white, not black, behind a transparent PNG.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', THUMB_JPEG_QUALITY))
  } catch {
    return null
  }
}

// Hex SHA-256 of the file exactly as uploaded, stored on the row so the
// original can later be shown to be unchanged. Null if hashing isn't available.
export async function sha256Hex(file) {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

// The one upload path for a gear photo: original first (untouched), then the
// thumbnail beside it. A failed thumbnail is not a failed upload — the photo
// is still saved and shown full-size until the nightly backfill fills it in.
// `bucket` is supabase.storage.from('gear-photos').
export async function uploadGearPhoto(bucket, path, file) {
  const [thumb, sha256] = await Promise.all([makeThumbnail(file), sha256Hex(file)])
  const { error } = await bucket.upload(path, file, { contentType: file.type || 'image/jpeg' })
  if (error) return { error }
  let thumb_path = null
  if (thumb) {
    const candidate = thumbPathFor(path)
    const { error: thumbError } = await bucket.upload(candidate, thumb, { contentType: 'image/jpeg' })
    if (!thumbError) thumb_path = candidate
  }
  return { thumb_path, sha256 }
}

// Forces a real save-to-disk instead of a bare `<a href download>` — Supabase
// Storage URLs are cross-origin, and browsers don't reliably honor the
// `download` attribute (or the suggested filename) on a cross-origin link;
// most just navigate to the image instead. Fetching the bytes into a blob
// and downloading *that* (same-origin, from the browser's own memory) is
// honored everywhere.
export async function downloadMedia(url, filename) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  const blob = await res.blob()
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename || ''
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(blobUrl)
}

// Basename for a download's suggested filename, pulled off the storage path
// (or public URL) so the file lands on disk as "IMG_1234.jpg" rather than a
// UUID/query string.
export function mediaFilename(path) {
  return (path || '').split('/').pop().split('?')[0] || 'photo'
}
