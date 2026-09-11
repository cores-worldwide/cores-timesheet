// A gear_photos.storage_path can now point at a video (see 2026-08-18
// migration widening the bucket's allowed_mime_types) — this is the one
// place that decides "photo or video" so every thumbnail/lightbox agrees.
const VIDEO_EXT_RE = /\.(mp4|mov|webm|3gp|m4v)$/i

export function isVideoPath(path) {
  return VIDEO_EXT_RE.test(path || '')
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
