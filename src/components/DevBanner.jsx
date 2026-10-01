import React, { useEffect } from 'react'

// Local dev only (`npm run dev`) — never renders in the built site. The local
// app talks to whichever database .env.local points at, and that's normally
// the live one, so every button there changes real payroll. A red frame and
// label make that impossible to miss. Green only when the env file says it's
// the dev database (VITE_DEV_DATABASE=1 in .env.development.local, see
// scripts/dev-db.sh) or a local Supabase stack — anything else is assumed live.
const isLocalDb = import.meta.env.VITE_DEV_DATABASE === '1' ||
  /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(import.meta.env.VITE_SUPABASE_URL || '')

export default function DevBanner() {
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const tag = isLocalDb ? '[DEV · dev DB] ' : '[DEV → LIVE DB] '
    const apply = () => { if (!document.title.startsWith(tag)) document.title = tag + document.title }
    apply()
    const titleEl = document.querySelector('title')
    if (!titleEl) return
    const obs = new MutationObserver(apply)
    obs.observe(titleEl, { childList: true })
    return () => obs.disconnect()
  }, [])

  if (!import.meta.env.DEV) return null
  const color = isLocalDb ? '#2d6a38' : '#c0392b'
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, border: `4px solid ${color}`, pointerEvents: 'none', zIndex: 99999 }} />
      <div style={{
        position: 'fixed', bottom: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 99999,
        background: color, color: '#fff', padding: '0.3rem 0.9rem', borderRadius: '4px',
        fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.03em', pointerEvents: 'none',
        boxShadow: '0 2px 6px rgba(0,0,0,0.25)', whiteSpace: 'nowrap',
      }}>
        {isLocalDb ? 'DEV · TEST DATABASE · fake data' : 'DEV → LIVE DATABASE · changes here are real'}
      </div>
    </>
  )
}
