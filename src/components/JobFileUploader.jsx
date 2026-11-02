import React, { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { uploadJobFiles, foldersFromPaths } from '../utils/scanFiling'

// Upload files or whole folders to a job's Files (Jim, 2026-11-02): buttons
// plus a drop zone. A folder's sub-folders become the job's folders (see
// foldersFromPaths). Used on the job's page (Job Reports) and on Admin →
// Scan to Report, where the job must be picked first.
const MAX_BYTES = 50 * 1024 * 1024

const smallButton = (enabled) => ({
  padding: '0.3rem 0.7rem', border: `1px solid ${enabled ? '#0066cc' : '#b8c7d9'}`, borderRadius: 4, background: '#fff',
  color: enabled ? '#0066cc' : '#9aa9bb', cursor: enabled ? 'pointer' : 'default', fontSize: '0.8rem',
})

// Everything under a dropped folder, read through the browser's file entries.
async function readEntry(entry, out) {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej))
    out.push({ file, path: entry.fullPath.replace(/^\//, '') })
  } else if (entry.isDirectory) {
    const reader = entry.createReader()
    // readEntries hands back at most ~100 at a time; keep asking until empty.
    for (;;) {
      const batch = await new Promise((res, rej) => reader.readEntries(res, rej))
      if (!batch.length) break
      for (const e of batch) await readEntry(e, out)
    }
  }
}

export default function JobFileUploader({ job, onUploaded, disabledHint, showJobLink }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [doneLink, setDoneLink] = useState('') // where the files went (Jim, 2026-11-02: "I don't see where they went")
  const [dragging, setDragging] = useState(false)
  const filesRef = useRef(null)
  const folderRef = useRef(null)
  const ready = !!job && !busy

  const send = async (picked) => {
    setError('')
    setDone('')
    setDoneLink('')
    const items = foldersFromPaths(picked)
    if (!items.length) return
    const tooBig = items.filter(({ file }) => file.size > MAX_BYTES)
    if (tooBig.length) { setError(`Over 50 MB, so not uploaded: ${tooBig.map(({ file }) => file.name).join(', ')}. Nothing was uploaded.`); return }
    const folders = [...new Set(items.map((i) => i.folder).filter(Boolean))]
    setBusy(`Uploading 1 of ${items.length}…`)
    try {
      const failed = await uploadJobFiles(job, items, (n, total, name) => setBusy(`Uploading ${n} of ${total}: ${name}`))
      const ok = items.length - failed.length
      setDone(`${ok} file${ok === 1 ? '' : 's'} uploaded to job ${job.job_number}${folders.length ? ` (${folders.length === 1 ? 'folder' : 'folders'}: ${folders.join(', ')})` : ''}.`)
      if (ok) setDoneLink(`/reports?job=${job.id}&files=${encodeURIComponent(folders.join('|'))}`)
      if (failed.length) setError(`${failed.length} didn't upload: ${failed.join(' · ')}`)
    } finally {
      setBusy('')
      onUploaded?.()
    }
  }

  const onDrop = async (e) => {
    e.preventDefault()
    setDragging(false)
    if (!job || busy) return
    // Take the entries now; the drop's item list is gone after the first await.
    const entries = [...(e.dataTransfer.items || [])].map((i) => i.webkitGetAsEntry?.()).filter(Boolean)
    const loose = [...(e.dataTransfer.files || [])]
    try {
      const picked = []
      if (entries.length) for (const en of entries) await readEntry(en, picked)
      else loose.forEach((file) => picked.push({ file, path: file.name }))
      await send(picked)
    } catch (err) {
      setError(`Couldn't read what was dropped: ${err.message || err}`)
    }
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (job && !busy) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      style={{ padding: '0.6rem 0.75rem', borderRadius: 6, border: `2px dashed ${dragging ? '#0066cc' : '#d5dbe3'}`, background: dragging ? '#eef5ff' : '#fafbfc' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => filesRef.current?.click()} disabled={!ready} style={smallButton(ready)}>Upload files</button>
        <button onClick={() => folderRef.current?.click()} disabled={!ready} style={smallButton(ready)}>Upload folder</button>
        <span style={{ color: '#888', fontSize: '0.8rem' }}>
          {busy || (job ? 'or drop files or folders here' : disabledHint || 'Pick the job first.')}
        </span>
      </div>
      <input ref={filesRef} type="file" multiple style={{ display: 'none' }}
        onChange={(e) => { const l = [...e.target.files]; e.target.value = ''; send(l.map((file) => ({ file, path: file.name }))) }} />
      <input ref={folderRef} type="file" webkitdirectory="" directory="" multiple style={{ display: 'none' }}
        onChange={(e) => { const l = [...e.target.files]; e.target.value = ''; send(l.map((file) => ({ file, path: file.webkitRelativePath || file.name }))) }} />
      {done && (
        <div style={{ color: '#2e7d32', fontSize: '0.85rem', marginTop: '0.35rem' }}>
          {done}
          {showJobLink && doneLink && <> <Link to={doneLink} style={{ color: '#0066cc', fontWeight: 600 }}>Open job {job.job_number}'s files →</Link></>}
        </div>
      )}
      {error && <div style={{ color: '#c0392b', fontSize: '0.85rem', marginTop: '0.35rem' }}>{error}</div>}
    </div>
  )
}
