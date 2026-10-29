import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import MediaViewer from './MediaViewer'
import { mediaFilename } from '../utils/media'

const gearPhotoUrl = (path) => supabase.storage.from('gear-photos').getPublicUrl(path).data.publicUrl

const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
const fmtDateTime = (ts) => new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const fmtShort = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const fmtSize = (bytes) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

const TYPE_LABELS = { supply: '🔧 Supply', reference: '📋 Reference', measurement: '📏 Measurement', receipt: '🧾 Receipt' }

const PANEL_WIDTH = 320
const NARROW_QUERY = '(max-width: 760px)'

function useIsNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY)
    const onChange = () => setNarrow(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}

// The office's full-size photo viewer, shared by Gear Photos, Reports, the
// Admin Dashboard and SMS Review: the photo plus everything recorded about
// it (job, who sent it, when it was taken, what they texted, the office note,
// supplies taken off it, location). Callers only hold a few columns per photo
// to keep grid loads small, so the details are fetched here, for the one photo
// that's open, rather than widening every grid's query.
export default function PhotoLightbox({ photo, onClose, zIndex = 1100 }) {
  const narrow = useIsNarrow()
  const [details, setDetails] = useState(null)
  const [supplies, setSupplies] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setDetails(null)
    setSupplies([])
    setError(null)
    Promise.all([
      supabase.schema('Cores').from('gear_photos')
        .select('*, employees(name), jobs(job_number, description, status, customers(name), vessels(name))')
        .eq('id', photo.id).maybeSingle(),
      supabase.schema('Cores').from('job_supplies')
        .select('id, supply_name, quantity, applied_at, billed_at')
        .eq('source_photo_id', photo.id).order('applied_at'),
    ]).then(([p, s]) => {
      if (cancelled) return
      if (p.error || s.error) setError((p.error || s.error).message)
      else if (!p.data) setError('This photo has been deleted.')
      else { setDetails(p.data); setSupplies(s.data || []) }
    })
    return () => { cancelled = true }
  }, [photo.id])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const mediaMaxWidth = narrow ? 'calc(100vw - 2rem)' : `calc(100vw - ${PANEL_WIDTH}px - 5rem)`
  const mediaMaxHeight = narrow ? '55vh' : 'calc(100vh - 3rem)'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex, cursor: 'zoom-out',
        display: 'flex', flexDirection: narrow ? 'column' : 'row', alignItems: 'center',
        justifyContent: narrow ? 'flex-start' : 'center', gap: '1rem',
        padding: narrow ? '1rem' : '1.5rem', overflowY: narrow ? 'auto' : 'hidden',
      }}
    >
      {/* Click-through blocked so MediaViewer's drag-to-pan and the video
          controls don't also close the lightbox. Only the backdrop closes it. */}
      <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0, cursor: 'default' }}>
        <MediaViewer
          src={gearPhotoUrl(photo.storage_path)}
          alt={details?.jobs?.job_number || photo.ship_or_job || 'photo'}
          maxMediaWidth={mediaMaxWidth}
          maxMediaHeight={mediaMaxHeight}
          style={{ objectFit: 'contain', borderRadius: 4 }}
        />
      </div>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: narrow ? '100%' : PANEL_WIDTH, flexShrink: 0, maxHeight: narrow ? 'none' : 'calc(100vh - 3rem)',
          overflowY: narrow ? 'visible' : 'auto', background: '#fff', borderRadius: 8, padding: '1rem',
          cursor: 'default', boxSizing: 'border-box', fontSize: '0.85rem', color: '#333',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-0.5rem' }}>
          <button onClick={onClose} title="Close" style={{ border: 'none', background: 'transparent', fontSize: '1.2rem', cursor: 'pointer', color: '#888', padding: 0 }}>✕</button>
        </div>
        {error ? (
          <div style={{ color: '#c00' }}>Couldn't load the photo details: {error}</div>
        ) : !details ? (
          <div style={{ color: '#888' }}>Loading details…</div>
        ) : (
          <PhotoDetails d={details} supplies={supplies} />
        )}
      </div>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div style={{ marginBottom: '0.7rem' }}>
      <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#888', marginBottom: '0.15rem' }}>{label}</div>
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{children}</div>
    </div>
  )
}

function PhotoDetails({ d, supplies }) {
  const job = d.jobs
  const suggested = d.suggested_supplies || []
  const hasLocation = d.photo_latitude != null && d.photo_longitude != null

  return (
    <>
      <Row label="Job">
        {job ? (
          <>
            <strong>{job.job_number}</strong>{job.description ? ` — ${job.description}` : ''}
            {job.status === 'closed' && <span style={{ color: '#888' }}> (closed)</span>}
            {(job.customers?.name || job.vessels?.name) && (
              <div style={{ color: '#666' }}>{[job.customers?.name, job.vessels?.name].filter(Boolean).join(' · ')}</div>
            )}
          </>
        ) : (
          <span style={{ color: '#b06000' }}>Not linked to a job</span>
        )}
        {d.ship_or_job && (!job || d.ship_or_job !== job.job_number) && (
          <div style={{ color: '#666' }}>Ship / job written as: “{d.ship_or_job}”</div>
        )}
      </Row>

      <Row label="Sent by">{d.employees?.name || d.from_phone || 'Unknown'}</Row>

      <Row label="Work date">{fmtDate(d.work_date)}</Row>

      <Row label="When">
        {d.photo_timestamp && <div>Taken {fmtDateTime(d.photo_timestamp)}</div>}
        <div style={{ color: d.photo_timestamp ? '#666' : undefined }}>Received {fmtDateTime(d.created_at)}</div>
      </Row>

      {d.photo_type && <Row label="Type">{TYPE_LABELS[d.photo_type] || d.photo_type}</Row>}

      {d.message_text && <Row label="What they sent with it">{d.message_text}</Row>}

      {d.note && <Row label="Note">{d.note}</Row>}

      {(supplies.length > 0 || suggested.length > 0) && (
        <Row label="Supplies">
          {supplies.map(s => (
            <div key={s.id}>
              {s.quantity} × {s.supply_name}
              <span style={{ color: s.billed_at ? '#2a7a2a' : '#888' }}>
                {s.billed_at ? ` — billed ${fmtShort(s.billed_at)}` : ' — not billed yet'}
              </span>
            </div>
          ))}
          {suggested.length > 0 && (
            <div style={{ color: '#b06000', marginTop: supplies.length ? '0.3rem' : 0 }}>
              Suggested, not added yet: {suggested.map(sg => `${sg.quantity || 1} × ${sg.supply_name}`).join(', ')}
            </div>
          )}
        </Row>
      )}

      {hasLocation && (
        <Row label="Location">
          <a href={`https://www.google.com/maps?q=${d.photo_latitude},${d.photo_longitude}`} target="_blank" rel="noopener noreferrer">View on map</a>
        </Row>
      )}

      <Row label="File">
        <span style={{ color: '#666' }}>{mediaFilename(d.storage_path)}{d.file_size_bytes ? ` · ${fmtSize(d.file_size_bytes)}` : ''}</span>
      </Row>
    </>
  )
}
