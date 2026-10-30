import React, { useState, useEffect, useRef, useCallback } from 'react'
import { findTemplate } from '../utils/reportTemplates'
import { supabase } from '../supabaseClient'
import { listJobFiles, uploadJobFiles, openStoredFile, moveJobFile, removeJobFile } from '../utils/scanFiling'
import JobPicker from '../employee/JobPicker'

// The office's files for a job (Jim, 2026-10-30): measurement reports filed
// from Admin → Scan to Report (each with its original scan) and anything
// uploaded here, e.g. the external report Niki writes from the measurements.
// Office only. Files are in a private bucket and open through hour-long links.
// A file on the wrong job can be moved or removed (removed = hidden, kept).
const MAX_BYTES = 50 * 1024 * 1024

export default function JobFiles({ job }) {
  const [files, setFiles] = useState(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState('')
  const inputRef = useRef(null)
  const [action, setAction] = useState(null) // { id, kind: 'move' | 'remove' }
  const [jobs, setJobs] = useState(null)
  const [busy, setBusy] = useState(false)

  const startMove = (f) => {
    setError('')
    setAction({ id: f.id, kind: 'move' })
    if (!jobs) supabase.schema('Cores').from('jobs').select('id, job_number, description, status, vessels(name)').order('job_number')
      .then(({ data }) => setJobs((data || []).filter((j) => j.id !== job.id)))
  }
  const run = async (fn) => {
    setError('')
    setBusy(true)
    try {
      await fn()
      setAction(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
      load()
    }
  }

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
                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {action?.id === f.id && action.kind === 'remove' ? (
                    <>
                      <span style={{ color: '#555', fontSize: '0.85rem' }}>Remove{scansFor(f.id).length ? ' it and its scan' : ''}? </span>
                      <button style={{ ...link, color: '#c0392b' }} disabled={busy} onClick={() => run(() => removeJobFile(f))}>Remove</button>{' · '}
                      <button style={link} onClick={() => setAction(null)}>Cancel</button>
                    </>
                  ) : action?.id === f.id && action.kind === 'move' ? (
                    <div style={{ minWidth: '260px', textAlign: 'left' }}>
                      <div style={{ fontSize: '0.85rem', color: '#555', marginBottom: '0.25rem' }}>Move{scansFor(f.id).length ? ' it and its scan' : ''} to job:</div>
                      {jobs ? <JobPicker jobs={jobs} value={null} onChange={(to) => run(() => moveJobFile(f, to))}
                        inputStyle={{ width: '100%', padding: '0.35rem', fontSize: '0.9rem', boxSizing: 'border-box' }} /> : <span style={{ color: '#999' }}>Loading jobs…</span>}
                      <button style={{ ...link, marginTop: '0.25rem' }} onClick={() => setAction(null)}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <button style={link} onClick={() => startMove(f)}>Move</button>{' · '}
                      <button style={link} onClick={() => { setError(''); setAction({ id: f.id, kind: 'remove' }) }}>Remove</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
