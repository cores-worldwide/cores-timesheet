import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { findTemplate } from '../utils/reportTemplates'
import { supabase } from '../supabaseClient'
import { listJobFiles, openStoredFile, moveJobFile, moveJobFileToFolder, removeJobFile, shownFolder } from '../utils/scanFiling'
import JobPicker from '../employee/JobPicker'
import JobFileUploader from './JobFileUploader'

// The office's files for a job (Jim, 2026-10-30): measurement reports filed
// from Admin → Scan to Report (each with its original scan) and anything
// uploaded here, e.g. the external report Niki writes from the measurements.
// Office only. Files are in a private bucket and open through hour-long links.
// A file on the wrong job or folder can be moved, or removed (hidden, kept).
//
// Folders (Jim, 2026-11-02): files sit in one level of folders (e.g.
// valve-train, con-rods), shown closed; click one to open it. Uploading a
// folder from the computer keeps its sub-folder names (JobFileUploader).

const link = { background: 'none', border: 'none', padding: 0, color: '#0066cc', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.9rem', textAlign: 'left' }
const NEW_FOLDER = '__new__'

export default function JobFiles({ job }) {
  const [files, setFiles] = useState(null)
  const [error, setError] = useState('')
  const [action, setAction] = useState(null) // { id, kind: 'move' | 'remove' }
  const [jobs, setJobs] = useState(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState({}) // folder name -> open
  const [newFolder, setNewFolder] = useState('')
  const [folderChoice, setFolderChoice] = useState('')

  // Link from an upload on Scan to Report: /reports?job=<id>&files=a|b opens
  // those folders and scrolls to Files, so she sees where the upload went.
  const [searchParams] = useSearchParams()
  const filesParam = searchParams.get('job') === job.id ? searchParams.get('files') : null
  const boxRef = useRef(null)
  const jumped = useRef(false)
  useEffect(() => {
    if (filesParam === null || !files || jumped.current) return
    jumped.current = true
    const names = filesParam.split('|').filter(Boolean)
    if (names.length) setOpen((o) => ({ ...o, ...Object.fromEntries(names.map((n) => [n, true])) }))
    boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [filesParam, files])

  const load = useCallback(() => {
    listJobFiles(job.id).then(setFiles).catch((e) => setError(e.message))
  }, [job.id])
  useEffect(() => { load() }, [load])

  const startMove = (f) => {
    setError('')
    setNewFolder('')
    setFolderChoice('')
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

  const openFile = async (path, name) => {
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

  const scansFor = (id) => (files || []).filter((f) => f.kind === 'scan' && f.source_id === id)
  // A report's own scan is listed under the report, not on its own.
  const shown = (files || []).filter((f) => f.kind !== 'scan' || !files.some((r) => r.id === f.source_id))
  const folderNames = [...new Set(shown.map(shownFolder).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const inFolder = (name) => shown.filter((f) => shownFolder(f) === name).sort((a, b) => a.file_name.localeCompare(b.file_name, undefined, { numeric: true }))
  const loose = shown.filter((f) => !shownFolder(f))
  const what = (f) => f.kind === 'report' ? `Measurement report${findTemplate(f.template_id) ? ` — ${findTemplate(f.template_id).label}` : ''}`
    : f.kind === 'scan' ? 'Scan' : 'Uploaded'

  const moveFolderPanel = (f) => {
    const current = shownFolder(f)
    const target = folderChoice === NEW_FOLDER ? newFolder.trim() : folderChoice === '' ? undefined : folderChoice === '(none)' ? null : folderChoice
    const canMove = target !== undefined && target !== current && !(folderChoice === NEW_FOLDER && !target)
    return (
      <div style={{ minWidth: '260px', textAlign: 'left' }}>
        <div style={{ fontSize: '0.85rem', color: '#555', marginBottom: '0.25rem' }}>Move{scansFor(f.id).length ? ' it and its scan' : ''} to a folder on this job:</div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          <select value={folderChoice} onChange={(e) => setFolderChoice(e.target.value)} style={{ padding: '0.3rem', fontSize: '0.85rem' }}>
            <option value="">Choose…</option>
            {folderNames.filter((n) => n !== current).map((n) => <option key={n} value={n}>{n}</option>)}
            {current && <option value="(none)">No folder</option>}
            <option value={NEW_FOLDER}>New folder…</option>
          </select>
          {folderChoice === NEW_FOLDER && <input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="Folder name" maxLength={100} style={{ padding: '0.3rem', fontSize: '0.85rem', width: '9rem' }} />}
          <button style={link} disabled={!canMove || busy} onClick={() => run(() => moveJobFileToFolder(f, target))}>Move</button>
        </div>
        <div style={{ fontSize: '0.85rem', color: '#555', margin: '0.5rem 0 0.25rem' }}>…or to another job:</div>
        {jobs ? <JobPicker jobs={jobs} value={null} onChange={(to) => run(() => moveJobFile(f, to))}
          inputStyle={{ width: '100%', padding: '0.35rem', fontSize: '0.9rem', boxSizing: 'border-box' }} /> : <span style={{ color: '#999' }}>Loading jobs…</span>}
        <button style={{ ...link, marginTop: '0.25rem' }} onClick={() => setAction(null)}>Cancel</button>
      </div>
    )
  }

  const fileRows = (list, inside = false) => list.map((f) => (
    <tr key={f.id} style={{ borderBottom: '1px solid #f0f0f0', verticalAlign: 'top', background: inside ? '#fcfdff' : undefined }}>
      <td style={{ padding: inside ? '0.4rem 0.5rem 0.4rem 2rem' : '0.4rem 0.5rem' }}>
        <button style={link} onClick={() => openFile(f.storage_path, f.file_name)}>{f.file_name}</button>
        {scansFor(f.id).map((s) => (
          <div key={s.id}><button style={{ ...link, fontSize: '0.85rem' }} onClick={() => openFile(s.storage_path)}>Original scan ({s.file_name})</button></div>
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
        ) : action?.id === f.id && action.kind === 'move' ? moveFolderPanel(f) : (
          <>
            <button style={link} onClick={() => startMove(f)}>Move</button>{' · '}
            <button style={link} onClick={() => { setError(''); setAction({ id: f.id, kind: 'remove' }) }}>Remove</button>
          </>
        )}
      </td>
    </tr>
  ))

  return (
    <div ref={boxRef} style={{ marginBottom: '2rem', scrollMarginTop: '70px' }}>
      <h4 style={{ color: '#555', margin: '0 0 0.75rem' }}>Files</h4>
      <div style={{ marginBottom: '0.75rem' }}>
        <JobFileUploader job={job} onUploaded={load} />
      </div>
      {error && <div style={{ color: '#c0392b', fontSize: '0.9rem', marginBottom: '0.5rem' }}>{error}</div>}
      {files && !shown.length && <div style={{ color: '#999', fontSize: '0.9rem' }}>No files yet. Upload reports, scans or whole folders for this job, or file a measurement report from Admin → Scan to Report.</div>}
      {shown.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          {folderNames.map((name) => {
            const list = inFolder(name)
            const isOpen = !!open[name]
            return (
              <tbody key={`f-${name}`}>
                <tr style={{ borderBottom: '1px solid #eee', background: isOpen ? '#f5f8fc' : undefined, cursor: 'pointer' }}
                  onClick={() => setOpen((o) => ({ ...o, [name]: !o[name] }))}>
                  <td colSpan={4} style={{ padding: '0.5rem' }}>
                    <span style={{ display: 'inline-block', width: '1rem', color: '#888' }}>{isOpen ? '▾' : '▸'}</span>
                    <span aria-hidden="true">📁 </span>
                    <strong>{name}</strong>
                    <span style={{ color: '#888', marginLeft: '0.6rem' }}>{list.length} file{list.length === 1 ? '' : 's'}</span>
                  </td>
                </tr>
                {isOpen && fileRows(list, true)}
              </tbody>
            )
          })}
          <tbody>{fileRows(loose)}</tbody>
        </table>
      )}
    </div>
  )
}
