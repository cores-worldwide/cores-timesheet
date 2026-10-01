import { useEffect, useRef } from 'react'

// Background auto-refresh for admin screens, so one admin's change shows up on
// another admin's already-open screen without a manual reload.
//
// Each refresh re-downloads whole tables, and those bytes count against the
// Supabase plan's egress quota. A plain 10-second setInterval on Timesheets and
// SMS Review drove the org to 11.4 GB of a 5.5 GB monthly quota (Sept 2026),
// so refreshing is now:
//   - every `intervalMs` (default 60s), not 10s
//   - skipped while the tab is hidden; one refresh as soon as it's visible again
//   - stopped after `idleMs` (default 15 min) with no mouse/keyboard/touch input;
//     one refresh on the next input
//   - skipped while `pausedRef.current` is true (an edit modal or save in flight)
export function useAutoRefresh(refresh, { pausedRef, intervalMs = 60000, idleMs = 15 * 60000 } = {}) {
  const refreshRef = useRef(refresh)
  useEffect(() => { refreshRef.current = refresh })

  useEffect(() => {
    let lastActivity = Date.now()
    let lastRefresh = Date.now()

    const canRefresh = () => document.visibilityState === 'visible' && !pausedRef?.current
    const run = () => {
      lastRefresh = Date.now()
      refreshRef.current()
    }

    const id = setInterval(() => {
      if (Date.now() - lastActivity > idleMs) return
      if (canRefresh()) run()
    }, intervalMs)

    // Coming back to a hidden or idle screen: catch up once, right away, unless
    // the last refresh was recent enough that the interval will cover it.
    const catchUp = () => {
      if (canRefresh() && Date.now() - lastRefresh > intervalMs) run()
    }
    const onActivity = () => {
      const wasIdle = Date.now() - lastActivity > idleMs
      lastActivity = Date.now()
      if (wasIdle) catchUp()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        lastActivity = Date.now()
        catchUp()
      }
    }

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel']
    activityEvents.forEach(e => window.addEventListener(e, onActivity, { passive: true }))
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(id)
      activityEvents.forEach(e => window.removeEventListener(e, onActivity))
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [pausedRef, intervalMs, idleMs])
}
