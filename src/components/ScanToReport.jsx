import React, { useState, useRef, useEffect } from 'react'
import { REPORT_TEMPLATES } from '../utils/reportTemplates'
import { useScanJobs, startScan, dismissJob, saveReport, openScan, toFillCount } from '../utils/scanJobs'

// Scan to Report (Admin tab; Niki, 2026-10-29): drop in a scanned handwritten
// inspection sheet, pick the report template, and get the filled .xlsx back
// to open in Excel, check, and save wherever she likes.
//
// The scan is read twice by the scan-report edge function and only values
// both reads agree on are filled (Jim's rule: if you don't know, don't guess).
// Unsure cells come back empty and yellow, with an Excel note. Nothing is kept: no history, no lookups of old reports.
//
// Scans run in the background (src/utils/scanJobs.js): start one, go
// elsewhere in the app, and a prompt pops up to save the report when it's
// ready (ScanReadyPrompt in AdminApp.jsx).

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

const card = { padding: '1rem 1.25rem', background: '#fff', borderRadius: '6px', border: '1px solid #e0e0e0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '1rem' }
const button = (enabled) => ({ padding: '0.55rem 1.2rem', border: 'none', borderRadius: '4px', fontSize: '0.95rem', fontWeight: 600, cursor: enabled ? 'pointer' : 'default', background: enabled ? '#0066cc' : '#b8c7d9', color: '#fff' })
const linkButton = { padding: '0.35rem 0.8rem', border: '1px solid #ccc', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '0.85rem' }

const elapsed = (from, to) => {
  const secs = Math.max(0, Math.round(((to || Date.now()) - from) / 1000))
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

function JobCard({ job, onError }) {
  const r = job.result
  return (
    <div style={{ ...card, borderLeft: `4px solid ${job.status === 'done' ? '#2e7d32' : job.status === 'failed' ? '#c0392b' : '#0066cc'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700 }}>
            {job.status === 'reading' && <>Reading {job.fileName}…</>}
            {job.status === 'done' && (job.savedAs ? <>Saved as {job.savedAs}</> : <>Report ready: {r.name}</>)}
            {job.status === 'failed' && <>Couldn't read {job.fileName}</>}
          </div>
          <div style={{ color: '#666', fontSize: '0.85rem' }}>
            {job.templateLabel}
            {job.status === 'reading' && <> · {elapsed(job.startedAt)} so far (usually about a minute). You can leave this page; you'll be asked where to save it when it's ready.</>}
            {job.status === 'done' && <> · from {job.fileName} · {toFillCount(job) ? `${toFillCount(job)} cells to fill in or check (yellow)` : 'nothing left blank'}</>}
          </div>
          {job.status === 'done' && r.usedToday && <div style={{ color: '#7a4b00', fontSize: '0.85rem' }}>The date on the sheet couldn't be read for the file name, so today's date was used.</div>}
          {job.status === 'failed' && <div style={{ color: '#c0392b', fontSize: '0.9rem', marginTop: '0.25rem' }}>{job.error}</div>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {job.status === 'done' && <button onClick={() => openScan(job.id)} style={linkButton}>Open the scan</button>}
          {job.status === 'done' && <button onClick={() => saveReport(job.id).catch((e) => onError(`Couldn't save the report: ${e.message}`))} style={job.savedAs ? linkButton : button(true)}>{job.savedAs ? 'Save again…' : 'Save as…'}</button>}
          {job.status !== 'reading' && <button onClick={() => dismissJob(job.id)} style={linkButton}>Dismiss</button>}
        </div>
      </div>
    </div>
  )
}

export default function ScanToReport() {
  const [templateId, setTemplateId] = useState(REPORT_TEMPLATES[0]?.id || '')
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [, tick] = useState(0)
  const jobs = useScanJobs()
  const inputRef = useRef(null)

  // Keep the "so far" timers moving while anything is reading.
  const anyReading = jobs.some((j) => j.status === 'reading')
  useEffect(() => {
    if (!anyReading) return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [anyReading])

  const pickFile = (f) => {
    setError('')
    if (!f) return
    if (!ACCEPT.includes(f.type)) { setError('Please use a PDF scan, or a JPEG/PNG photo of the sheet.'); return }
    if (f.size > MAX_BYTES) { setError('That file is over 10 MB. Try scanning at a lower resolution.'); return }
    setFile(f)
  }

  const run = () => {
    if (!file) return
    try {
      startScan(file, templateId)
      setFile(null)
    } catch (e) {
      setError(e.message || String(e))
    }
  }

  return (
    <div style={{ maxWidth: '900px' }}>
      <h2 style={{ marginTop: 0 }}>Scan to Report</h2>
      <p style={{ color: '#555', marginTop: 0 }}>
        Drop in a scanned inspection sheet and get the filled-in Excel report. Anything the reader isn't sure of is left blank and highlighted yellow for you to fill in.
        You can start a scan and carry on with other work; when the report is ready you'll be asked where to save it.
      </p>

      <div style={card}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem' }}>Report template</label>
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
          style={{ padding: '0.45rem', fontSize: '0.95rem', minWidth: '320px', maxWidth: '100%' }}>
          {REPORT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>

        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]) }}
          style={{
            marginTop: '1rem', padding: '2rem 1rem', textAlign: 'center', borderRadius: '6px', cursor: 'pointer',
            border: `2px dashed ${dragging ? '#0066cc' : '#bbb'}`, background: dragging ? '#eef5ff' : '#fafafa',
          }}>
          {file
            ? <><div style={{ fontWeight: 600 }}>{file.name}</div><div style={{ color: '#777', fontSize: '0.85rem' }}>{(file.size / 1024 / 1024).toFixed(1)} MB — click or drop to choose a different file</div></>
            : <><div style={{ fontWeight: 600 }}>Drop the scan here</div><div style={{ color: '#777', fontSize: '0.85rem' }}>or click to browse — PDF, or a JPEG/PNG photo</div></>}
          <input ref={inputRef} type="file" accept={ACCEPT.join(',')} style={{ display: 'none' }}
            onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
        </div>

        <div style={{ marginTop: '1rem' }}>
          <button onClick={run} disabled={!file} style={button(!!file)}>Read scan & make report</button>
        </div>
        {error && <div style={{ marginTop: '0.75rem', color: '#c0392b' }}>{error}</div>}
      </div>

      {jobs.map((job) => (
        <JobCard key={job.id} job={job} onError={setError} />
      ))}
    </div>
  )
}
