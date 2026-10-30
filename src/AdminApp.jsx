import React from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import AdminDashboard from './components/AdminDashboard'
import Reports from './components/Reports'
import AdminPanel from './components/AdminPanel'
import Search from './components/Search'
import PasswordGate from './components/PasswordGate'
import { useScanJobs, saveReport, dismissPrompt, openScan, toFillCount } from './utils/scanJobs'

// Pops up over whatever page the office is on when a scan's report is ready,
// so "Save as…" (a click, which the save dialog needs) is one step away.
function ScanReadyPrompt() {
  const jobs = useScanJobs()
  const [error, setError] = React.useState('')
  const [justSaved, setJustSaved] = React.useState(null) // job id saved from this pop-up
  const job = [...jobs].reverse().find((j) => j.status === 'done' && (!j.prompted || j.id === justSaved))
  if (!job) return null
  const save = () => {
    setError('')
    saveReport(job.id).then(() => setJustSaved(job.id)).catch((e) => setError(`Couldn't save the report: ${e.message}`))
  }
  const later = () => { setError(''); setJustSaved(null); dismissPrompt(job.id) }
  const n = toFillCount(job)
  const saved = job.id === justSaved && job.savedAs
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div role="dialog" aria-label="Report ready" style={{ background: '#fff', borderRadius: '8px', padding: '1.25rem 1.5rem', maxWidth: '460px', width: '100%', boxShadow: '0 8px 30px rgba(0,0,0,0.25)' }}>
        <h3 style={{ marginTop: 0 }}>{saved ? 'Report saved' : 'Report ready'}</h3>
        {saved ? (
          <p style={{ margin: '0 0 1rem' }}>
            Saved as <strong>{job.savedAs}</strong>. Open it in Excel from that folder{n ? ` and fill in the ${n} yellow cells` : ''}; open the scan here to read them from.
          </p>
        ) : (
          <p style={{ margin: '0 0 1rem' }}>
            From <strong>{job.fileName}</strong>. {n ? `${n} cells to fill in or check (yellow).` : 'Nothing was left blank.'} Choose a name and folder for it.
          </p>
        )}
        {error && <p style={{ color: '#c0392b', fontSize: '0.9rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          {saved ? (
            <>
              <button onClick={later} style={{ padding: '0.5rem 1rem', border: '1px solid #ccc', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}>Close</button>
              <button onClick={() => { openScan(job.id); later() }} autoFocus style={{ padding: '0.5rem 1.1rem', border: 'none', borderRadius: '4px', background: '#0066cc', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Open the scan</button>
            </>
          ) : (
            <>
              <button onClick={later} style={{ padding: '0.5rem 1rem', border: '1px solid #ccc', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}>Later</button>
              <button onClick={save} autoFocus style={{ padding: '0.5rem 1.1rem', border: 'none', borderRadius: '4px', background: '#0066cc', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Save as…</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Top-bar badge for Scan to Report jobs running in the background; click to
// open Admin → Scan to Report.
function ScanIndicator() {
  const navigate = useNavigate()
  const jobs = useScanJobs()
  const reading = jobs.filter((j) => j.status === 'reading').length
  const failed = jobs.filter((j) => j.status === 'failed').length
  const done = jobs.filter((j) => j.status === 'done' && !j.savedAs).length
  if (!reading && !failed && !done) return null
  const text = reading ? `📄 Reading ${reading} scan${reading > 1 ? 's' : ''}…`
    : failed ? `📄 ${failed} scan${failed > 1 ? 's' : ''} failed`
    : `📄 ${done} report${done > 1 ? 's' : ''} to save`
  return (
    <button onClick={() => navigate('/admin', { state: { section: 'scan' } })} title="Open Scan to Report" style={{
      padding: '0.35rem 0.8rem', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
      background: reading ? '#f0b429' : failed ? '#c0392b' : '#2e7d32', color: reading ? '#1a1a2e' : '#fff',
    }}>{text}</button>
  )
}

function AdminApp() {
  const navigate = useNavigate()
  const location = useLocation()
  // Real URLs instead of local state so the browser back/forward buttons
  // step through tabs within the app instead of leaving it entirely.
  const adminView = location.pathname.startsWith('/dashboard') ? 'dashboard'
    : location.pathname.startsWith('/admin') ? 'admin'
    : location.pathname.startsWith('/search') ? 'search' : 'reports'

  return (
    <PasswordGate>
      <div>
        <nav className="no-print" style={{ background: '#1a1a2e', padding: '0.75rem 2rem', display: 'flex', gap: '0.5rem', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 }}>
          <span style={{ color: '#fff', fontWeight: 700, marginRight: '1.5rem' }}>Cores Worldwide</span>
          {[['reports', 'Job Reports'], ['dashboard', 'Timesheets'], ['admin', 'Admin'], ['search', '🔍 Search']].map(([key, label]) => (
            <button key={key} onClick={() => navigate(`/${key}`)} style={{
              padding: '0.4rem 1rem', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem',
              background: adminView === key ? '#0066cc' : 'transparent',
              color: adminView === key ? '#fff' : '#aaa',
            }}>{label}</button>
          ))}
          <span style={{ marginLeft: 'auto' }}><ScanIndicator /></span>
          <button onClick={() => window.location.reload()} style={{ padding: '0.4rem 1rem', border: '1px solid #555', borderRadius: '4px', background: 'transparent', color: '#aaa', cursor: 'pointer', fontSize: '0.9rem' }}>Refresh</button>
        </nav>
        <ScanReadyPrompt />
        <Routes>
          <Route index element={<Navigate to="/reports" replace />} />
          <Route path="reports" element={<Reports />} />
          <Route path="dashboard/*" element={<AdminDashboard />} />
          <Route path="admin" element={<AdminPanel />} />
          <Route path="search" element={<Search />} />
          <Route path="*" element={<Navigate to="/reports" replace />} />
        </Routes>
      </div>
    </PasswordGate>
  )
}

export default AdminApp
