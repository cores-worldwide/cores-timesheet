// A gear_photos.storage_path can now point at a video (see 2026-08-18
// migration widening the bucket's allowed_mime_types) — this is the one
// place that decides "photo or video" so every thumbnail/lightbox agrees.
const VIDEO_EXT_RE = /\.(mp4|mov|webm|3gp|m4v)$/i

export function isVideoPath(path) {
  return VIDEO_EXT_RE.test(path || '')
}

// Caps outgoing photo bytes at the source — a phone camera photo can be
// several MB despite only ever being displayed as a small grid thumbnail or
// a contained lightbox image, and every one of those bytes gets re-paid in
// full on every view since gear-photos has no server-side resizing (Sept
// 2026 Supabase Fair Use warning — a single unpaginated gallery load was
// transferring tens of MB of full-resolution originals for thumbnail-sized
// display). Video isn't touched here — client-side video transcoding isn't
// practical in-browser; that's handled by the bucket's own size cap instead.
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.82

export async function compressImage(file) {
  if (!file || !file.type?.startsWith('image/') || file.type === 'image/gif') return file
  try {
    // Bake the EXIF rotation into the pixels — the re-encoded JPEG below
    // carries no EXIF, so a sideways phone photo would otherwise stay sideways.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 800 * 1024) {
      bitmap.close?.()
      return file // already small and already within bounds — don't bother re-encoding
    }
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    // JPEG has no alpha — without this a transparent PNG (screenshot, receipt
    // scan) comes out on a black background instead of white.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!blob || blob.size >= file.size) return file // re-encode didn't actually help — keep the original
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg' })
  } catch {
    // HEIC/HEIF and a few other formats aren't decodable via createImageBitmap
    // in every browser — fail open to the original file rather than block the upload.
    return file
  }
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
