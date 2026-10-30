import React, { useState, useRef, useEffect } from 'react'
import { REPORT_TEMPLATES } from '../utils/reportTemplates'
import { useScanJobs, startScan, dismissJob, downloadBytes } from '../utils/scanJobs'

// Scan to Report (Admin tab; Niki, 2026-10-29): drop in a scanned handwritten
// inspection sheet, pick the report template, and get the filled .xlsx back
// to open in Excel, check, and save wherever she likes.
//
// The scan is read twice by the scan-report edge function and only values
// both reads agree on are filled (Jim's rule: if you don't know, don't guess).
// Unsure cells come back empty and yellow, with an Excel note and a line in
// the summary below. Nothing is kept: no history, no lookups of old reports.
//
// Scans run in the background (src/utils/scanJobs.js): start one, go
// elsewhere in the app, and the report downloads when it's ready.

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

const card = { padding: '1rem 1.25rem', background: '#fff', borderRadius: '6px', border: '1px solid #e0e0e0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '1rem' }
const button = (enabled) => ({ padding: '0.55rem 1.2rem', border: 'none', borderRadius: '4px', fontSize: '0.95rem', fontWeight: 600, cursor: enabled ? 'pointer' : 'default', background: enabled ? '#0066cc' : '#b8c7d9', color: '#fff' })
const linkButton = { padding: '0.35rem 0.8rem', border: '1px solid #ccc', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '0.85rem' }
const th = { textAlign: 'left', padding: '0.3rem 0.6rem', borderBottom: '1px solid #ddd', fontSize: '0.85rem', color: '#555' }
const td = { padding: '0.3rem 0.6rem', borderBottom: '1px solid #f0f0f0', fontSize: '0.9rem', verticalAlign: 'top' }

const elapsed = (from, to) => {
  const secs = Math.max(0, Math.round(((to || Date.now()) - from) / 1000))
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

function ReportSummary({ result }) {
  const s = result.summary
  return (
    <>
      <p style={{ marginBottom: 0 }}>
        <strong>{s.filled}</strong> cell{s.filled === 1 ? '' : 's'} filled.{' '}
        {s.unsure.length
          ? <><strong>{s.unsure.length}</strong> left blank (yellow) because the reader wasn't sure{result.notesAdded ? ' — each has a note in Excel with the candidate reading' : ''}.</>
          : 'Nothing was left blank as unsure.'}
        {s.toCheck.length > 0 && <> <strong>{s.toCheck.length}</strong> filled from a correction on the paper but highlighted yellow to check.</>}
      </p>

      {s.unsure.length > 0 && (
        <>
          <h4 style={{ marginBottom: '0.3rem' }}>Left blank — please check the paper</h4>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr><th style={th}>Cell</th><th style={th}>Field</th><th style={th}>Candidate reading</th><th style={th}>Why</th></tr></thead>
            <tbody>
              {s.unsure.map((u) => (
                <tr key={u.ref} style={{ background: '#fffbe0' }}>
                  <td style={td}>{u.ref}</td><td style={td}>{u.label}</td>
                  <td style={td}>{u.candidates.length ? u.candidates.join(' / ') : '—'}</td>
                  <td style={td}>{u.note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {s.toCheck.length > 0 && (
        <>
          <h4 style={{ marginBottom: '0.3rem' }}>Corrections filled in — please check (yellow)</h4>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr><th style={th}>Cell</th><th style={th}>Field</th><th style={th}>Reading</th><th style={th}>Why</th></tr></thead>
            <tbody>
              {s.toCheck.map((c) => (
                <tr key={c.ref} style={{ background: '#fffbe0' }}><td style={td}>{c.ref}</td><td style={td}>{c.label}</td><td style={{ ...td, fontWeight: 600 }}>{c.value}</td><td style={td}>{c.note || ''}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {s.outOfSpec.length > 0 && (
        <>
          <h4 style={{ marginBottom: '0.3rem' }}>Outside the spec printed on the sheet</h4>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr><th style={th}>Cell</th><th style={th}>Field</th><th style={th}>Reading</th><th style={th}>Spec</th></tr></thead>
            <tbody>
              {s.outOfSpec.map((o) => (
                <tr key={o.ref}><td style={td}>{o.ref}</td><td style={td}>{o.label}</td><td style={{ ...td, fontWeight: 600 }}>{o.value}</td><td style={td}>{o.spec.join(' – ')}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {s.noted.length > 0 && (
        <>
          <h4 style={{ marginBottom: '0.3rem' }}>Filled, with a note</h4>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr><th style={th}>Cell</th><th style={th}>Field</th><th style={th}>Reading</th><th style={th}>Note</th></tr></thead>
            <tbody>
              {s.noted.map((n) => (
                <tr key={n.ref}><td style={td}>{n.ref}</td><td style={td}>{n.label}</td><td style={td}>{n.value}</td><td style={td}>{n.note}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {s.generalNotes.length > 0 && (
        <>
          <h4 style={{ marginBottom: '0.3rem' }}>About the sheet</h4>
          <ul style={{ marginTop: 0 }}>{s.generalNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </>
      )}
    </>
  )
}

function JobCard({ job, open, onToggle }) {
  const r = job.result
  return (
    <div style={{ ...card, borderLeft: `4px solid ${job.status === 'done' ? '#2e7d32' : job.status === 'failed' ? '#c0392b' : '#0066cc'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700 }}>
            {job.status === 'reading' && <>Reading {job.fileName}…</>}
            {job.status === 'done' && <>Downloaded {r.name}</>}
            {job.status === 'failed' && <>Couldn't read {job.fileName}</>}
          </div>
          <div style={{ color: '#666', fontSize: '0.85rem' }}>
            {job.templateLabel}
            {job.status === 'reading' && <> · {elapsed(job.startedAt)} so far (usually about a minute). You can leave this page; it downloads when ready.</>}
            {job.status === 'done' && <> · from {job.fileName} · took {elapsed(job.startedAt, job.finishedAt)}</>}
          </div>
          {job.status === 'done' && r.usedToday && <div style={{ color: '#7a4b00', fontSize: '0.85rem' }}>The date on the sheet couldn't be read for the file name, so today's date was used.</div>}
          {job.status === 'failed' && <div style={{ color: '#c0392b', fontSize: '0.9rem', marginTop: '0.25rem' }}>{job.error}</div>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {job.status === 'done' && <button onClick={onToggle} style={linkButton}>{open ? 'Hide details' : 'Show details'}</button>}
          {job.status === 'done' && <button onClick={() => downloadBytes(r.bytes, r.name)} style={linkButton}>Download again</button>}
          {job.status !== 'reading' && <button onClick={() => dismissJob(job.id)} style={linkButton}>Dismiss</button>}
        </div>
      </div>
      {job.status === 'done' && open && <ReportSummary result={r} />}
    </div>
  )
}

export default function ScanToReport() {
  const [templateId, setTemplateId] = useState(REPORT_TEMPLATES[0]?.id || '')
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [openIds, setOpenIds] = useState({})
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

  // The newest finished report shows its details unless closed.
  const latestDone = jobs.find((j) => j.status === 'done')?.id
  const isOpen = (id) => (id in openIds ? openIds[id] : id === latestDone)

  return (
    <div style={{ maxWidth: '900px' }}>
      <h2 style={{ marginTop: 0 }}>Scan to Report</h2>
      <p style={{ color: '#555', marginTop: 0 }}>
        Drop in a scanned inspection sheet and get the filled-in Excel report. Anything the reader isn't sure of is left blank and highlighted yellow for you to fill in.
        You can start a scan and carry on with other work; the report downloads by itself when it's ready.
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
        <JobCard key={job.id} job={job} open={isOpen(job.id)} onToggle={() => setOpenIds((o) => ({ ...o, [job.id]: !isOpen(job.id) }))} />
      ))}
    </div>
  )
}
