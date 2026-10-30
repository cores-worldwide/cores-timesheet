import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { REPORT_TEMPLATES, findTemplate } from '../utils/reportTemplates'
import { readCellText, matchJob, fileReport } from '../utils/scanFiling'
import JobPicker from '../employee/JobPicker'
import { useScanJobs, startScan, dismissJob, openReport, openScan, toFillCount, markFiled } from '../utils/scanJobs'

// Scan to Report (Admin tab; Niki, 2026-10-29): drop in a scanned handwritten
// inspection sheet, pick the report template, and get the filled .xlsx back
// to open in Excel, check, and save wherever she likes.
//
// The scan is read twice by the scan-report edge function and only values
// both reads agree on are filled (Jim's rule: if you don't know, don't guess).
// Unsure cells come back empty and yellow, with an Excel note. When she has
// filled them in, she drops the finished .xlsx back in to file it on its job
// with the original scan (FileReport below; shown on Job Reports).
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

// Files a finished report on its job. The job is read from the Job No. cell
// she filled in; she confirms it (or picks one) before anything is stored.
function FileReport({ scanFile, defaultTemplateId, jobs, onFiled, onCancel }) {
  const [templateId] = useState(defaultTemplateId)
  const [reportFile, setReportFile] = useState(null)
  const [scan, setScan] = useState(scanFile || null)
  const [written, setWritten] = useState('')
  const [job, setJob] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const reportRef = useRef(null)
  const scanRef = useRef(null)

  const pickReport = async (f) => {
    setError('')
    if (!f) return
    if (!/\.xlsx$/i.test(f.name)) { setError('Choose the Excel report (.xlsx) you saved and filled in.'); return }
    setReportFile(f)
    const t = findTemplate(templateId)
    try {
      const text = await readCellText(await f.arrayBuffer(), t.sheet, t.header.job_no.cell)
      setWritten(text)
      setJob(matchJob(jobs, text))
    } catch {
      setWritten('')
      setJob(null)
    }
  }

  const file = async () => {
    setError('')
    setBusy(true)
    try {
      await fileReport({ job, templateId, reportFile, scanFile: scan })
      onFiled(job)
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#f7f9fc', borderRadius: '6px', border: '1px solid #dde5f0' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => reportRef.current?.click()} style={linkButton}>{reportFile ? `Report: ${reportFile.name}` : 'Choose the finished Excel report…'}</button>
        <input ref={reportRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={(e) => { pickReport(e.target.files?.[0]); e.target.value = '' }} />
        <button onClick={() => scanRef.current?.click()} style={linkButton}>{scan ? `Scan: ${scan.name}` : 'Choose the original scan…'}</button>
        <input ref={scanRef} type="file" accept={ACCEPT.join(',')} style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) setScan(f); e.target.value = '' }} />
      </div>
      {reportFile && (
        <div style={{ marginTop: '0.75rem' }}>
          <div style={{ fontSize: '0.9rem', marginBottom: '0.35rem' }}>
            {written ? <>Job No. on the sheet: <strong>{written}</strong>. {job ? 'Check this is the right job:' : 'No job matches that, so pick the job:'}</> : 'The Job No. on the sheet is blank, so pick the job:'}
          </div>
          <div style={{ maxWidth: '420px' }}>
            <JobPicker jobs={jobs} value={job?.id} onChange={setJob}
              inputStyle={{ width: '100%', padding: '0.45rem', fontSize: '0.95rem', boxSizing: 'border-box' }} />
          </div>
        </div>
      )}
      {error && <div style={{ marginTop: '0.5rem', color: '#c0392b', fontSize: '0.9rem' }}>{error}</div>}
      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
        <button onClick={file} disabled={!reportFile || !job || busy} style={button(!!reportFile && !!job && !busy)}>{busy ? 'Filing…' : job ? `File on job ${job.job_number}` : 'File on job'}</button>
        <button onClick={onCancel} style={linkButton}>Cancel</button>
      </div>
      {!scan && reportFile && <div style={{ marginTop: '0.4rem', color: '#7a4b00', fontSize: '0.85rem' }}>Add the original scan too if you have it, so the numbers can be checked against the paper later.</div>}
    </div>
  )
}

function JobCard({ job, jobs }) {
  const [filing, setFiling] = useState(false)

  const r = job.result
  return (
    <div style={{ ...card, borderLeft: `4px solid ${job.status === 'done' ? '#2e7d32' : job.status === 'failed' ? '#c0392b' : '#0066cc'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700 }}>
            {job.status === 'reading' && <>Reading {job.fileName}…</>}
            {job.status === 'done' && <>Report ready: {r.name}</>}
            {job.status === 'failed' && <>Couldn't read {job.fileName}</>}
          </div>
          <div style={{ color: '#666', fontSize: '0.85rem' }}>
            {job.templateLabel}
            {job.status === 'reading' && <> · {elapsed(job.startedAt)} so far (usually about a minute). You can leave this page; it opens in Excel when it's ready.</>}
            {job.status === 'done' && <> · from {job.fileName} · {toFillCount(job) ? `${toFillCount(job)} cells to fill in or check (yellow)` : 'nothing left blank'}</>}
          </div>
          {job.status === 'done' && r.usedToday && <div style={{ color: '#7a4b00', fontSize: '0.85rem' }}>The date on the sheet couldn't be read for the file name, so today's date was used.</div>}
          {job.status === 'failed' && <div style={{ color: '#c0392b', fontSize: '0.9rem', marginTop: '0.25rem' }}>{job.error}</div>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {job.status === 'done' && <button onClick={() => openScan(job.id)} style={linkButton}>Open the scan</button>}
          {job.status === 'done' && <button onClick={() => openReport(job.id)} style={linkButton}>Open the report again</button>}
          {job.status === 'done' && !job.filedOn && <button onClick={() => setFiling(true)} style={linkButton}>File finished report…</button>}
          {job.status !== 'reading' && <button onClick={() => dismissJob(job.id)} style={linkButton}>Dismiss</button>}
        </div>
      </div>
      {job.filedOn && <div style={{ color: '#2e7d32', fontSize: '0.9rem', marginTop: '0.35rem' }}>Filed on job {job.filedOn}. It's under Files on that job's page in Job Reports.</div>}
      {filing && !job.filedOn && (
        <FileReport scanFile={job.file} defaultTemplateId={job.templateId} jobs={jobs}
          onCancel={() => setFiling(false)}
          onFiled={(j) => { setFiling(false); markFiled(job.id, j.job_number) }} />
      )}
    </div>
  )
}

export default function ScanToReport() {
  const [templateId, setTemplateId] = useState(REPORT_TEMPLATES[0]?.id || '')
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [, tick] = useState(0)
  const scans = useScanJobs()
  const inputRef = useRef(null)
  const [jobs, setJobs] = useState([])
  const [filingLoose, setFilingLoose] = useState(false)
  const [filedMsg, setFiledMsg] = useState('')

  useEffect(() => {
    supabase.schema('Cores').from('jobs').select('id, job_number, description, status, vessels(name)').order('job_number')
      .then(({ data }) => setJobs(data || []))
  }, [])

  // Keep the "so far" timers moving while anything is reading.
  const anyReading = scans.some((j) => j.status === 'reading')
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
        You can start a scan and carry on with other work; when the report is ready it opens in Excel.
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

      {scans.map((job) => (
        <JobCard key={job.id} job={job} jobs={jobs} />
      ))}

      <div style={card}>
        <div style={{ fontWeight: 700 }}>File a finished report</div>
        <div style={{ color: '#666', fontSize: '0.9rem' }}>
          After filling in the blanks in Excel, file the report on its job with the original scan. (For a scan above, use its own File finished report button.)
        </div>
        {filedMsg && <div style={{ color: '#2e7d32', fontSize: '0.9rem', marginTop: '0.35rem' }}>{filedMsg}</div>}
        {filingLoose
          ? <FileReport key={filedMsg} defaultTemplateId={templateId} jobs={jobs}
              onCancel={() => setFilingLoose(false)}
              onFiled={(j) => { setFilingLoose(false); setFiledMsg(`Filed on job ${j.job_number}. It's under Files on that job's page in Job Reports.`) }} />
          : <button onClick={() => { setFiledMsg(''); setFilingLoose(true) }} style={{ ...linkButton, marginTop: '0.6rem' }}>File a report…</button>}
      </div>
    </div>
  )
}
