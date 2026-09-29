import React, { useEffect, useState } from 'react'

// A page that was already open when a new version was deployed keeps running
// the old code until it's reloaded — for the office that meant an old tab
// without newer safeguards (e.g. the approval checks), for the crew an app
// sitting in the background. This compares the build id baked into this
// bundle with the one in /version.json (written at build time, see
// vite.config.js) and, when they differ, offers a reload.
//
// It never reloads on its own: a field the tech is still typing in would be
// lost. The button gives the field a moment to autosave first.
const CURRENT_BUILD = __BUILD_ID__
const CHECK_EVERY_MS = 5 * 60 * 1000
const SAVE_GRACE_MS = 1500

export default function UpdateBanner() {
  const [stale, setStale] = useState(false)
  const [reloading, setReloading] = useState(false)

  useEffect(() => {
    if (import.meta.env.DEV || stale) return
    let cancelled = false

    async function check() {
      try {
        // Timestamp query + no-store so neither the browser nor the CDN hands back a cached copy.
        const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const { id } = await res.json()
        if (!cancelled && id && id !== CURRENT_BUILD) setStale(true)
      } catch {
        // Offline or blocked — just try again next time.
      }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') check() }

    check()
    const timer = setInterval(check, CHECK_EVERY_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [stale])

  if (!stale) return null

  function reload() {
    setReloading(true)
    // Blur first so any field mid-edit runs its on-blur autosave, then give the request time to land.
    if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur()
    setTimeout(() => window.location.reload(), SAVE_GRACE_MS)
  }

  return (
    <div
      role="status"
      className="no-print"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 10000,
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '0.75rem',
        padding: '0.75rem 1rem', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
        background: '#1a1a2e', color: '#fff', fontSize: '0.95rem', boxShadow: '0 -2px 8px rgba(0,0,0,0.25)',
      }}
    >
      <span>A new version of the app is ready.</span>
      <button
        onClick={reload}
        disabled={reloading}
        style={{ padding: '0.4rem 1rem', border: 'none', borderRadius: 4, background: '#0066cc', color: '#fff', fontWeight: 600, fontSize: '0.95rem', cursor: reloading ? 'default' : 'pointer' }}
      >
        {reloading ? 'Reloading…' : 'Reload now'}
      </button>
    </div>
  )
}
