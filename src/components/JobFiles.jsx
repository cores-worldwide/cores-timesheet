import React, { useState, useEffect, useRef, useCallback } from 'react'
import { findTemplate } from '../utils/reportTemplates'
import { listJobFiles, uploadJobFiles, openStoredFile } from '../utils/scanFiling'

// The office's files for a job (Jim, 2026-10-30): measurement reports filed
// from Admin → Scan to Report (each with its original scan) and anything
// uploaded here, e.g. the external report Niki writes from the measurements.
// Office only. Files are in a private bucket and open through hour-long links.
const MAX_BYTES = 50 * 1024 * 1024

export default function JobFiles({ job }) {
  const [files, setFiles] = useState(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState('')
  const inputRef = useRef(null)

  const load = useCallback(() => {
    listJobFiles(job.id).then(setFiles).catch((e) => setError(e.message))
  }, [job.id])
  useEffect(() => { load() }, [load])

  const open = async (path, name) => {
    setError('')
    // Open the tab inside the click so pop-up blockers allow it, then point it at the file.
    const tab = window.open('', '_blank')
    try {
      const url = await openStoredFile(path, name)
      if (tab) tab.location.href = url
      else window.location.href = url
    } catch (e) {
      tab?.close()
      setError(e.message)
    }
  }

  const upload = async (list) => {
    setError('')
    const chosen = [...(list || [])]
    if (!chosen.length) return
    const tooBig = chosen.find((f) => f.size > MAX_BYTES)
    if (tooBig) { setError(`${tooBig.name} is over 50 MB.`); return }
    setUploading(chosen.length === 1 ? chosen[0].name : `${chosen.length} files`)
    try {
      await uploadJobFiles(job, chosen)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading('')
      load()
    }
  }

  const scansFor = (id) => (files || []).filter((f) => f.kind === 'scan' && f.source_id === id)
  const shown = (files || []).filter((f) => f.kind !== 'scan' || !files.some((r) => r.id === f.source_id))
  const link = { background: 'none', border: 'none', padding: 0, color: '#0066cc', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.9rem', textAlign: 'left' }
  const what = (f) => f.kind === 'report' ? `Measurement report${findTemplate(f.template_id) ? ` — ${findTemplate(f.template_id).label}` : ''}`
    : f.kind === 'scan' ? 'Scan' : 'Uploaded'

  return (
    <div style={{ marginBottom: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h4 style={{ color: '#555', margin: 0 }}>Files</h4>
        <button onClick={() => inputRef.current?.click()} disabled={!!uploading}
          style={{ marginLeft: 'auto', padding: '0.3rem 0.7rem', border: '1px solid #0066cc', borderRadius: 4, background: '#fff', color: '#0066cc', cursor: uploading ? 'default' : 'pointer', fontSize: '0.8rem' }}>
          {uploading ? `Uploading ${uploading}…` : 'Upload files'}
        </button>
        <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
      </div>
      {error && <div style={{ color: '#c0392b', fontSize: '0.9rem', marginBottom: '0.5rem' }}>{error}</div>}
      {files && !shown.length && <div style={{ color: '#999', fontSize: '0.9rem' }}>No files yet. Upload reports or documents for this job, or file a measurement report from Admin → Scan to Report.</div>}
      {shown.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <tbody>
            {shown.map((f) => (
              <tr key={f.id} style={{ borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' }}>
                <td style={{ padding: '0.4rem 0.5rem' }}>
                  <button style={link} onClick={() => open(f.storage_path, f.file_name)}>{f.file_name}</button>
                  {scansFor(f.id).map((s) => (
                    <div key={s.id}><button style={{ ...link, fontSize: '0.85rem' }} onClick={() => open(s.storage_path)}>Original scan ({s.file_name})</button></div>
                  ))}
                </td>
                <td style={{ padding: '0.4rem 0.5rem', color: '#555' }}>{what(f)}</td>
                <td style={{ padding: '0.4rem 0.5rem', color: '#777', whiteSpace: 'nowrap' }}>{new Date(f.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}{f.filed_by_name ? ` · ${f.filed_by_name}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
