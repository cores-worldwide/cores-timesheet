import { supabase } from '../supabaseClient'

// Guest book for the retired addresses. The Netlify copy and the old
// jimjardine.github.io address forward here with ?via=netlify / ?via=old-github;
// each tagged arrival is logged to Cores.shortcut_visits with whoever is logged
// in, so we can tell whose shortcut still needs re-adding. See the
// 20261002120000_create_shortcut_visits migration.

const KNOWN_VIA = ['netlify', 'old-github']
const PENDING_KEY = 'cores_arrived_via'
// Same keys EmployeeApp / PasswordGate use (read directly to keep this module
// free of component imports — it runs before React renders).
const EMPLOYEE_SESSION_KEY = 'cores_employee_session'
const ADMIN_UNLOCKED_KEY = 'cores_unlocked'
const ADMIN_NAME_KEY = 'cores_admin_name'

function currentIdentity(page) {
  try {
    if (page.startsWith('#/my')) {
      const s = JSON.parse(localStorage.getItem(EMPLOYEE_SESSION_KEY))
      return s?.id ? { employee_id: s.id, employee_name: s.name || null } : null
    }
    const name = localStorage.getItem(ADMIN_NAME_KEY)
    return localStorage.getItem(ADMIN_UNLOCKED_KEY) === 'true' && name ? { admin_name: name } : null
  } catch {
    return null
  }
}

// Logging must never get in the way of the app — failures only go to the console.
async function insertVisit(visit, stage, who) {
  const { error } = await supabase.schema('Cores').from('shortcut_visits').insert({
    visit_key: visit.key, via: visit.via, stage, page: visit.page,
    user_agent: navigator.userAgent, ...(who || {}),
  })
  if (error) console.warn('shortcut visit not logged:', error.message)
}

// Call once at startup, before rendering. Strips ?via from the address bar so it
// doesn't get saved into a new home-screen shortcut.
export function captureArrival() {
  const params = new URLSearchParams(window.location.search)
  const via = params.get('via')
  if (!via) return
  params.delete('via')
  const qs = params.toString()
  window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash)
  if (!KNOWN_VIA.includes(via)) return

  const visit = { key: crypto.randomUUID(), via, page: window.location.hash || '#/' }
  const who = currentIdentity(visit.page)
  insertVisit(visit, 'arrived', who)
  if (!who) {
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(visit)) } catch { /* private mode: arrival row still logged */ }
  }
}

// Call when someone logs in. If this tab arrived through an old address while
// logged out, adds the identity to that visit.
export function recordArrivalIdentity(who) {
  let visit = null
  try {
    visit = JSON.parse(sessionStorage.getItem(PENDING_KEY))
    sessionStorage.removeItem(PENDING_KEY)
  } catch { /* nothing pending */ }
  if (visit?.key) insertVisit(visit, 'logged_in', who)
}
