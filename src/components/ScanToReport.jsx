import React, { useState, useRef } from 'react'
import { REPORT_TEMPLATES, findTemplate, reportFilename } from '../utils/reportTemplates'
import { planCells, fillXlsx } from '../utils/xlsxFill'

// Scan to Report tab (Niki, 2026-10-29): drop in a scanned handwritten
// inspection sheet, pick the report template, and get the filled .xlsx back
// to open in Excel, check, and save wherever she likes.
//
// The scan is read twice by the scan-report edge function and only values
// both reads agree on are filled (Jim's rule: if you don't know, don't guess).
// Unsure cells come back empty and yellow, with an Excel note and a line in
// the summary below. Nothing is kept: no history, no lookups of old reports.

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-report`
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']

const card = { padding: '1rem 1.25rem', background: '#fff', borderRadius: '6px', border: '1px solid #e0e0e0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '1rem' }
const button = (enabled) => ({ padding: '0.55rem 1.2rem', border: 'none', borderRadius: '4px', fontSize: '0.95rem', fontWeight: 600, cursor: enabled ? 'pointer' : 'default', background: enabled ? '#0066cc' : '#b8c7d9', color: '#fff' })
const th = { textAlign: 'left', padding: '0.3rem 0.6rem', borderBottom: '1px solid #ddd', fontSize: '0.85rem', color: '#555' }
const td = { padding: '0.3rem 0.6rem', borderBottom: '1px solid #f0f0f0', fontSize: '0.9rem', verticalAlign: 'top' }

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] || '')
    r.onerror = () => reject(new Error('Could not read the file'))
    r.readAsDataURL(file)
  })
}

function downloadBytes(bytes, name) {
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export default function ScanToReport() {
  const [templateId, setTemplateId] = useState(REPORT_TEMPLATES[0]?.id || '')
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null) // { bytes, name, usedToday, summary, notesAdded }
  const inputRef = useRef(null)

  const pickFile = (f) => {
    setError('')
    setResult(null)
    if (!f) return
    if (!ACCEPT.includes(f.type)) { setError('Please use a PDF scan, or a JPEG/PNG photo of the sheet.'); return }
    if (f.size > MAX_BYTES) { setError('That file is over 10 MB. Try scanning at a lower resolution.'); return }
    setFile(f)
  }

  const run = async () => {
    const template = findTemplate(templateId)
    if (!template || !file || busy) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const data = await fileToBase64(file)
      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ template_id: template.id, media_type: file.type, data }),
      })
      const reading = await res.json().catch(() => null)
      if (!res.ok || !reading?.ok) throw new Error(reading?.error || `Reading the scan failed (${res.status})`)

      const tplRes = await fetch(`${import.meta.env.BASE_URL}${template.file}`)
      if (!tplRes.ok) throw new Error('Could not load the report template')
      const { writes, summary } = planCells(template, reading)
      const { bytes, notesAdded } = await fillXlsx(await tplRes.arrayBuffer(), template.sheet, writes)
      const { name, usedToday } = reportFilename(template, reading.header)
      downloadBytes(bytes, name)
      setResult({ bytes, name, usedToday, summary, notesAdded })
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const s = result?.summary

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      <h2 style={{ marginTop: 0 }}>Scan to Report</h2>
      <p style={{ color: '#555', marginTop: 0 }}>
        Drop in a scanned inspection sheet and get the filled-in Excel report. Anything the reader isn't sure of is left blank and highlighted yellow for you to fill in.
      </p>

      <div style={card}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem' }}>Report template</label>
        <select value={templateId} onChange={(e) => { setTemplateId(e.target.value); setResult(null) }} disabled={busy}
          style={{ padding: '0.45rem', fontSize: '0.95rem', minWidth: '320px', maxWidth: '100%' }}>
          {REPORT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>

        <div
          role="button"
          tabIndex={0}
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !busy) inputRef.current?.click() }}
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) pickFile(e.dataTransfer.files?.[0]) }}
          style={{
            marginTop: '1rem', padding: '2rem 1rem', textAlign: 'center', borderRadius: '6px', cursor: busy ? 'default' : 'pointer',
            border: `2px dashed ${dragging ? '#0066cc' : '#bbb'}`, background: dragging ? '#eef5ff' : '#fafafa',
          }}>
          {file
            ? <><div style={{ fontWeight: 600 }}>{file.name}</div><div style={{ color: '#777', fontSize: '0.85rem' }}>{(file.size / 1024 / 1024).toFixed(1)} MB — click or drop to choose a different file</div></>
            : <><div style={{ fontWeight: 600 }}>Drop the scan here</div><div style={{ color: '#777', fontSize: '0.85rem' }}>or click to browse — PDF, or a JPEG/PNG photo</div></>}
          <input ref={inputRef} type="file" accept={ACCEPT.join(',')} style={{ display: 'none' }}
            onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={run} disabled={!file || busy} style={button(!!file && !busy)}>
            {busy ? 'Reading the scan…' : 'Read scan & make report'}
          </button>
          {busy && <span style={{ color: '#555', fontSize: '0.9rem' }}>The sheet is read twice to be sure — this can take a minute or two.</span>}
        </div>
        {error && <div style={{ marginTop: '0.75rem', color: '#c0392b' }}>{error}</div>}
      </div>

      {result && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700 }}>Downloaded {result.name}</div>
              {result.usedToday && <div style={{ color: '#7a4b00', fontSize: '0.85rem' }}>The date on the sheet couldn't be read for the file name, so today's date was used.</div>}
            </div>
            <button onClick={() => downloadBytes(result.bytes, result.name)} style={button(true)}>Download again</button>
          </div>

          <p style={{ marginBottom: 0 }}>
            <strong>{s.filled}</strong> cell{s.filled === 1 ? '' : 's'} filled.{' '}
            {s.unsure.length
              ? <><strong>{s.unsure.length}</strong> left blank (yellow) because the reader wasn't sure{result.notesAdded ? ' — each has a note in Excel with the candidate reading' : ''}.</>
              : 'Nothing was left blank as unsure.'}
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
        </div>
      )}
    </div>
  )
}
