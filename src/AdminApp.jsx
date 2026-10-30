import React from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import AdminDashboard from './components/AdminDashboard'
import Reports from './components/Reports'
import AdminPanel from './components/AdminPanel'
import Search from './components/Search'
import PasswordGate from './components/PasswordGate'
import { useScanJobs } from './utils/scanJobs'

// Top-bar badge for Scan to Report jobs running in the background; click to
// open Admin → Scan to Report.
function ScanIndicator() {
  const navigate = useNavigate()
  const jobs = useScanJobs()
  const reading = jobs.filter((j) => j.status === 'reading').length
  const failed = jobs.filter((j) => j.status === 'failed').length
  const done = jobs.filter((j) => j.status === 'done').length
  if (!jobs.length) return null
  const text = reading ? `📄 Reading ${reading} scan${reading > 1 ? 's' : ''}…`
    : failed ? `📄 ${failed} scan${failed > 1 ? 's' : ''} failed`
    : `📄 ${done} report${done > 1 ? 's' : ''} ready`
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
