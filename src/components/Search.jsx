import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import MediaThumb from './MediaThumb'

// Search tab (Jim, 2026-10-14): one box that searches everything — hours,
// texts, photos, supplies, jobs, vessels, customers, engines, contacts.
// Andrew asked about "a barge he worked on" with no job # or vessel name and
// nothing in the app could find it. Matching runs in the database
// (Cores.search_everything): every word must appear in the row or in the
// job/vessel/customer/person it belongs to, so "andrew barge" works.
//
// The query lives in the URL (?q=) so Back from a job report or photo comes
// straight back to the same results.

const MAX_ROWS = 300

const KINDS = {
  entry:    { label: 'Hours',        color: '#2d6a38', bg: '#e6f4ea' },
  text:     { label: 'Texts',        color: '#7a4b00', bg: '#fff3dc' },
  photo:    { label: 'Photos',       color: '#5b3a8c', bg: '#f0e9fa' },
  supply:   { label: 'Supplies',     color: '#0b5f73', bg: '#e1f3f7' },
  job:      { label: 'Jobs',         color: '#0055aa', bg: '#e6f0fb' },
  job_note: { label: 'Job notes',    color: '#0055aa', bg: '#e6f0fb' },
  vessel:   { label: 'Vessels',      color: '#444',    bg: '#eee' },
  customer: { label: 'Customers',    color: '#444',    bg: '#eee' },
  engine:   { label: 'Engines',      color: '#444',    bg: '#eee' },
  contact:  { label: 'Contacts',     color: '#444',    bg: '#eee' },
}
const SINGULAR = { entry: 'Hours', text: 'Text', photo: 'Photo', supply: 'Supply', job: 'Job', job_note: 'Job note', vessel: 'Vessel', customer: 'Customer', engine: 'Engine', contact: 'Contact' }

const card = { padding: '1rem 1.25rem', background: '#fff', borderRadius: '6px', border: '1px solid #e0e0e0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }
const linkStyle = { color: '#0066cc', fontWeight: 600, cursor: 'pointer' }
const chip = (color, bg) => ({ display: 'inline-block', padding: '0.1rem 0.45rem', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 600, color, background: bg, whiteSpace: 'nowrap' })
const publicUrl = (path) => supabase.storage.from('gear-photos').getPublicUrl(path).data.publicUrl
const fmtDate = (ymd) => ymd ? new Date(ymd + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ''

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const splitWords = (q) => q.trim().toLowerCase().split(/\s+/).filter(Boolean)

// Wrap each matched word in <mark>. Long text is cut to a window around the
// first match so a 40-message text thread doesn't swamp the list.
function Highlight({ text, words, full }) {
  if (!text) return null
  let shown = text
  if (!full && text.length > 320) {
    const lower = text.toLowerCase()
    const first = Math.min(...words.map(w => lower.indexOf(w)).filter(i => i >= 0), Infinity)
    const start = first === Infinity ? 0 : Math.max(0, first - 120)
    shown = (start > 0 ? '…' : '') + text.slice(start, start + 320) + (start + 320 < text.length ? '…' : '')
  }
  if (!words.length) return shown
  const re = new RegExp(`(${words.map(escapeRe).join('|')})`, 'gi')
  return shown.split(re).map((part, i) =>
    i % 2 ? <mark key={i} style={{ background: '#ffe58a', padding: 0 }}>{part}</mark> : part)
}

export default function Search() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') || ''
  const [draft, setDraft] = useState(q)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [kindFilter, setKindFilter] = useState('all')
  const [expanded, setExpanded] = useState(new Set())
  const inputRef = useRef(null)
  const words = splitWords(q)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setDraft(q) }, [q])

  useEffect(() => {
    if (!words.length) { setResults(null); return }
    let cancelled = false
    setLoading(true)
    setError('')
    supabase.schema('Cores').rpc('search_everything', { q, max_rows: MAX_ROWS }).then(({ data, error }) => {
      if (cancelled) return
      setLoading(false)
      if (error) { setError(error.message); setResults([]); return }
      setResults(data || [])
      setKindFilter('all')
      setExpanded(new Set())
    })
    return () => { cancelled = true }
  }, [q])

  function submit(e) {
    e.preventDefault()
    const next = draft.trim()
    if (next) setSearchParams({ q: next })
    else setSearchParams({})
  }

  const openJob = (jobId) => navigate(`/reports?job=${jobId}`)
  const toggle = (id) => setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const counts = (results || []).reduce((acc, r) => { acc[r.kind] = (acc[r.kind] || 0) + 1; return acc }, {})
  const shown = (results || []).filter(r => kindFilter === 'all' || r.kind === kindFilter)

  // "Which job was that?" — the jobs the results point at, most hits first.
  const jobHits = Object.values((results || []).reduce((acc, r) => {
    if (!r.job_id || !r.job_number) return acc
    const j = acc[r.job_id] || (acc[r.job_id] = { job_id: r.job_id, job_number: r.job_number, vessel: r.vessel, customer: r.customer, n: 0, people: new Set(), first: r.work_date, last: r.work_date })
    j.n++
    if (r.employee) j.people.add(r.employee)
    if (r.work_date && (!j.first || r.work_date < j.first)) j.first = r.work_date
    if (r.work_date && (!j.last || r.work_date > j.last)) j.last = r.work_date
    return acc
  }, {})).sort((a, b) => b.n - a.n)

  return (
    <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
      <form onSubmit={submit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <input ref={inputRef} type="search" value={draft} onChange={e => setDraft(e.target.value)}
          placeholder="Search everything — e.g. barge, 4926, andrew barge, detroit pistons, september"
          style={{ flex: 1, minWidth: 0, padding: '0.65rem 0.9rem', fontSize: '1rem', border: '1px solid #bbb', borderRadius: '4px' }} />
        <button type="submit" style={{ padding: '0.6rem 1.4rem', background: '#0066cc', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '1rem' }}>Search</button>
      </form>
      <div style={{ color: '#777', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        Looks through hours, texts, photo notes, supplies, jobs, vessels, customers, engines and contacts. Every word must match somewhere — a person's name, job #, vessel, customer, month or anything they wrote. Not case sensitive.
      </div>

      {loading && <div style={{ color: '#888' }}>Searching…</div>}
      {error && <div style={{ ...card, color: '#c0392b' }}>Search failed: {error}</div>}

      {!loading && results && !error && (
        results.length === 0 ? (
          <div style={{ ...card, color: '#666' }}>Nothing found for <strong>{q}</strong>. Try fewer words, or part of a word (e.g. "detroit" instead of "detroits").</div>
        ) : (
          <>
            {results.length >= MAX_ROWS && (
              <div style={{ ...card, background: '#fff8e6', borderColor: '#f0d48a', marginBottom: '1rem', fontSize: '0.9rem' }}>
                Showing the newest {MAX_ROWS} matches only — add another word to narrow it down.
              </div>
            )}

            {jobHits.length > 0 && (
              <div style={{ ...card, marginBottom: '1.25rem' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.6rem' }}>Jobs in these results</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ color: '#666', textAlign: 'left' }}>
                        <th style={{ padding: '0.35rem 0.5rem' }}>Job #</th>
                        <th style={{ padding: '0.35rem 0.5rem' }}>Vessel</th>
                        <th style={{ padding: '0.35rem 0.5rem' }}>Customer</th>
                        <th style={{ padding: '0.35rem 0.5rem' }}>Dates</th>
                        <th style={{ padding: '0.35rem 0.5rem' }}>People</th>
                        <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>Matches</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobHits.map(j => (
                        <tr key={j.job_id} style={{ borderTop: '1px solid #eee' }}>
                          <td style={{ padding: '0.35rem 0.5rem' }}><span style={linkStyle} onClick={() => openJob(j.job_id)}>{j.job_number}</span></td>
                          <td style={{ padding: '0.35rem 0.5rem' }}>{j.vessel || '—'}</td>
                          <td style={{ padding: '0.35rem 0.5rem' }}>{j.customer || '—'}</td>
                          <td style={{ padding: '0.35rem 0.5rem', whiteSpace: 'nowrap' }}>{j.first === j.last ? fmtDate(j.first) : `${fmtDate(j.first)} – ${fmtDate(j.last)}`}</td>
                          <td style={{ padding: '0.35rem 0.5rem' }}>{[...j.people].sort().join(', ') || '—'}</td>
                          <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>{j.n}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {[['all', `All ${results.length}`], ...Object.keys(KINDS).filter(k => counts[k]).map(k => [k, `${KINDS[k].label} ${counts[k]}`])].map(([k, label]) => (
                <button key={k} onClick={() => setKindFilter(k)} style={{
                  padding: '0.3rem 0.8rem', borderRadius: '14px', cursor: 'pointer', fontSize: '0.85rem',
                  border: kindFilter === k ? '1px solid #0066cc' : '1px solid #ccc',
                  background: kindFilter === k ? '#0066cc' : '#fff', color: kindFilter === k ? '#fff' : '#444',
                }}>{label}</button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {shown.map(r => {
                const k = KINDS[r.kind] || KINDS.vessel
                const isOpen = expanded.has(r.id)
                const long = (r.body || '').length > 320
                const photoPath = r.kind === 'photo' && (r.extra?.thumb_path || r.extra?.storage_path)
                return (
                  <div key={`${r.kind}-${r.id}`} style={{ ...card, display: 'flex', gap: '1rem' }}>
                    {photoPath && (
                      <MediaThumb src={publicUrl(photoPath)} loading="lazy" alt=""
                        onClick={() => navigate(`/dashboard/photos?photo=${r.id}`)}
                        style={{ width: '88px', height: '88px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'baseline', marginBottom: '0.3rem', fontSize: '0.9rem' }}>
                        <span style={chip(k.color, k.bg)}>{SINGULAR[r.kind] || r.kind}</span>
                        {r.work_date && <strong>{fmtDate(r.work_date)}</strong>}
                        {r.employee && <span><Highlight text={r.employee} words={words} /></span>}
                        {r.job_number && (r.job_id
                          ? <span style={linkStyle} onClick={() => openJob(r.job_id)}>Job <Highlight text={r.job_number} words={words} /></span>
                          : <span>Job <Highlight text={r.job_number} words={words} /></span>)}
                        {r.vessel && <span style={{ color: '#555' }}><Highlight text={r.vessel} words={words} /></span>}
                        {r.customer && <span style={{ color: '#555' }}><Highlight text={r.customer} words={words} /></span>}
                        {r.title && <span style={{ color: '#333' }}>· <Highlight text={r.title} words={words} /></span>}
                        {r.kind === 'text' && r.extra?.status === 'rejected' && <span style={chip('#a33', '#fbe9e9')}>rejected</span>}
                        {r.kind === 'supply' && r.extra?.billed && <span style={chip('#555', '#eee')}>billed</span>}
                        {r.kind === 'photo' && <span style={linkStyle} onClick={() => navigate(`/dashboard/photos?photo=${r.id}`)}>Open photo</span>}
                      </div>
                      {r.body && (
                        <div style={{ whiteSpace: 'pre-wrap', color: '#333', fontSize: '0.9rem', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                          <Highlight text={r.body} words={words} full={isOpen} />
                          {long && <> <span style={{ ...linkStyle, fontWeight: 400, fontSize: '0.85rem' }} onClick={() => toggle(r.id)}>{isOpen ? 'Show less' : 'Show all'}</span></>}
                        </div>
                      )}
                      {r.kind === 'text' && (r.extra?.admin_note || r.extra?.rejection_reason) && (
                        <div style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.3rem' }}>
                          {r.extra.admin_note && <div>Office note: <Highlight text={r.extra.admin_note} words={words} /></div>}
                          {r.extra.rejection_reason && <div>Rejected: <Highlight text={r.extra.rejection_reason} words={words} /></div>}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )
      )}
    </div>
  )
}
