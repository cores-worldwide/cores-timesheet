import React, { useState, useEffect } from 'react'
import { findTemplate } from '../utils/reportTemplates'
import { listJobReports, openStoredFile } from '../utils/scanFiling'

// Measurement reports filed on a job from Admin → Scan to Report: the
// finished Excel report plus the scan it was read from (Jim, 2026-10-30).
// Files are in a private bucket and open through hour-long links.
export default function JobScanReports({ jobId }) {
  const [reports, setReports] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    listJobReports(jobId).then((r) => { if (live) setReports(r) }).catch((e) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [jobId])

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

  if (!reports?.length && !error) return null
  const link = { background: 'none', border: 'none', padding: 0, color: '#0066cc', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.9rem' }
  return (
    <div style={{ marginBottom: '2rem' }}>
      <h4 style={{ color: '#555', margin: '0 0 0.75rem' }}>Measurement Reports</h4>
      {error && <div style={{ color: '#c0392b', fontSize: '0.9rem', marginBottom: '0.5rem' }}>{error}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <tbody>
          {(reports || []).map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={{ padding: '0.4rem 0.5rem' }}>{findTemplate(r.template_id)?.label || r.template_id}</td>
              <td style={{ padding: '0.4rem 0.5rem' }}><button style={link} onClick={() => open(r.report_path, r.report_name)}>{r.report_name}</button></td>
              <td style={{ padding: '0.4rem 0.5rem' }}>{r.scan_path ? <button style={link} onClick={() => open(r.scan_path)}>Original scan</button> : <span style={{ color: '#999' }}>No scan</span>}</td>
              <td style={{ padding: '0.4rem 0.5rem', color: '#777' }}>Filed {new Date(r.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}{r.filed_by_name ? ` by ${r.filed_by_name}` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
