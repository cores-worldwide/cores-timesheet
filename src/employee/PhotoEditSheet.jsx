import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { deleteGearPhoto } from '../utils/media'
import JobPicker from './JobPicker'
import MediaViewer from '../components/MediaViewer'
import MediaThumb from '../components/MediaThumb'

const gearPhotoUrl = (path) => supabase.storage.from('gear-photos').getPublicUrl(path).data.publicUrl

// A day's photos as small thumbnails; tapping one opens PhotoEditSheet.
export function PhotoThumbs({ photos, onOpen, style }) {
  if (photos.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', ...style }}>
      {photos.map(p => (
        <div key={p.id} onClick={() => onOpen(p)} style={{ cursor: 'pointer', position: 'relative' }}>
          <MediaThumb src={gearPhotoUrl(p.thumb_path || p.storage_path)} alt={p.ship_or_job || 'photo'}
            style={{ width: '3.2rem', height: '3.2rem', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ddd', display: 'block' }} />
          {/* So a tech can spot which photos still need a job (tap to add one). */}
          {!p.job_id && (
            <span style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, background: 'rgba(160,107,0,0.9)', color: '#fff',
              fontSize: '0.6rem', fontWeight: 600, textAlign: 'center', borderRadius: '0 0 4px 4px', lineHeight: 1.5,
            }}>No job</span>
          )}
        </div>
      ))}
    </div>
  )
}

// A tech can fix their own photo (wrong or missing job, caption) or delete
// it for good, until the office has approved it (Jim, 2026-10-15 —
// Nikolai sent one with no job and had no way to add it; Corey wanted to
// delete blurry ones). "Approved" = that day already has approved
// timesheet_entries (every row there came through SMS Review approval), or
// the office has applied/billed a supply line made from this photo. Past
// that point it's the office's record, so the sheet just says to ask Niki.
async function photoLocked(employeeId, p) {
  const { count } = await supabase.schema('Cores').from('timesheet_entries')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', employeeId).eq('work_date', p.work_date)
  if (count > 0) return true
  const { data: linked } = await supabase.schema('Cores').from('job_supplies')
    .select('id').eq('source_photo_id', p.id)
    .or('applied_at.not.is.null,billed_at.not.is.null').limit(1)
  return (linked || []).length > 0
}

// Full-size photo plus its edit form, shared by the home screen and the
// pending-day edit screen. The lock is checked when it opens and again right
// before a write — the office may approve the day while it's open.
// onChanged() runs after a save or delete so the caller can reload.
export default function PhotoEditSheet({ photo, jobs, employeeId, onClose, onChanged }) {
  const [locked, setLocked] = useState(null)
  const [edit, setEdit] = useState({ job_id: photo.job_id || '', note: photo.note || '' })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    photoLocked(employeeId, photo).then(l => { if (!cancelled) setLocked(l) })
    return () => { cancelled = true }
  }, [employeeId, photo])

  const dirty = (edit.job_id || '') !== (photo.job_id || '') || edit.note.trim() !== (photo.note || '')

  async function lockedNow() {
    if (!(await photoLocked(employeeId, photo))) return false
    setError('The office has just approved this one — ask Niki to change it.')
    setLocked(true); setSaving(false); setConfirmDelete(false)
    return true
  }

  // Job fields mirror GearPhotos' saveContext (job_id, ship_or_job = job #,
  // pending_context = no job) and are only written when the job actually
  // changed, so saving just a caption never wipes a free-text ship name the
  // SMS path left in ship_or_job. Linked supply lines aren't moved: GearPhotos
  // doesn't either, and any applied/billed one locks the photo anyway.
  async function save() {
    setSaving(true); setError('')
    if (await lockedNow()) return
    const update = { note: edit.note.trim() || null }
    if ((edit.job_id || null) !== (photo.job_id || null)) {
      const jobNumber = edit.job_id ? jobs.find(j => j.id === edit.job_id)?.job_number || null : null
      Object.assign(update, { job_id: edit.job_id || null, ship_or_job: jobNumber, pending_context: !edit.job_id })
    }
    const { error: err } = await supabase.schema('Cores').from('gear_photos').update(update).eq('id', photo.id)
    if (err) { setError(err.message); setSaving(false); return }
    await onChanged()
    onClose()
  }

  // Gone for good — file, thumbnail and row — same as the office's delete
  // (shared helper, so linked-supply clean-up stays identical).
  async function remove() {
    setSaving(true); setError('')
    if (await lockedNow()) return
    const { error: err } = await deleteGearPhoto(supabase, photo)
    if (err) { setError(err.message); setSaving(false); return }
    await onChanged()
    onClose()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem 1rem', gap: '0.75rem',
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: '100%' }}>
        <MediaViewer
          src={gearPhotoUrl(photo.storage_path)}
          alt={photo.ship_or_job || 'photo'}
          maxMediaHeight={locked ? 'calc(100vh - 12rem)' : '50vh'}
          style={{ maxWidth: '100%', objectFit: 'contain', borderRadius: 4 }}
        />
      </div>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 10, padding: '1rem', width: '100%', maxWidth: '28rem', boxSizing: 'border-box' }}>
        {locked === null ? (
          <div className="emp-hint" style={{ margin: 0 }}>Loading…</div>
        ) : locked ? (
          <>
            <div style={{ fontSize: '0.9rem', color: '#555', marginBottom: '0.4rem' }}>
              {photo.ship_or_job ? `Job ${photo.ship_or_job}` : 'No job'}
              {photo.note ? ` — ${photo.note}` : ''}
            </div>
            {error && <div className="emp-error">{error}</div>}
            <div className="emp-hint" style={{ marginBottom: '0.75rem' }}>🔒 Approved by the office — ask Niki to change it.</div>
            <button className="emp-btn emp-btn-secondary" onClick={onClose}>Close</button>
          </>
        ) : (
          <>
            <div className="emp-field">
              <label>Job</label>
              <JobPicker jobs={jobs} value={edit.job_id} onChange={(job) => setEdit(f => ({ ...f, job_id: job.id }))}
                placeholder="No job — office will sort it out" />
              {edit.job_id && (
                <button type="button" className="emp-inline-link" style={{ marginTop: '0.3rem', fontSize: '0.8rem' }}
                  onClick={() => setEdit(f => ({ ...f, job_id: '' }))}>No job</button>
              )}
            </div>
            <div className="emp-field">
              <label>Caption</label>
              <textarea value={edit.note} placeholder="What's in this photo (optional)"
                onChange={e => setEdit(f => ({ ...f, note: e.target.value }))} />
            </div>
            {error && <div className="emp-error">{error}</div>}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="emp-btn" disabled={saving || !dirty} onClick={save} style={{ opacity: dirty ? 1 : 0.5 }}>
                {saving && !confirmDelete ? 'Saving…' : 'Save'}
              </button>
              <button className="emp-btn emp-btn-secondary" disabled={saving} onClick={onClose}>Close</button>
            </div>
            {/* Two taps, in the app itself — no browser confirm() popup. */}
            <div style={{ marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '0.75rem' }}>
              {confirmDelete ? (
                <>
                  <div style={{ fontSize: '0.9rem', color: '#c0392b', marginBottom: '0.5rem' }}>Delete this photo for good? It can't be undone.</div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="emp-btn" style={{ background: '#c0392b' }} disabled={saving} onClick={remove}>
                      {saving ? 'Deleting…' : 'Delete for good'}
                    </button>
                    <button className="emp-btn emp-btn-secondary" disabled={saving} onClick={() => setConfirmDelete(false)}>Cancel</button>
                  </div>
                </>
              ) : (
                <button className="emp-btn emp-btn-danger" disabled={saving} onClick={() => setConfirmDelete(true)}>Delete photo</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
