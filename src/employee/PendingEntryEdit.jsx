import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { fetchDailyOTContext, computeDailyOTSplit, fixShiftAmPm, amPmFixNote } from '../utils/entrySave'
import JobPicker from './JobPicker'
import AutoGrowTextarea from './AutoGrowTextarea'
import PhotoEditSheet, { PhotoThumbs } from './PhotoEditSheet'
import { addTechPhotos } from '../utils/media'
import './employee.css'

const blankEntry = () => ({ job_number: '', hours: '', description: '' })
const blankSupply = () => ({ job_number: '', supply_name: '', quantity: '1' })

function friendlyDate(d) {
  if (!d) return ''
  const [y, mo, day] = d.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[mo - 1]} ${day}, ${y}`
}

// Editor for a texted-in day that hasn't been approved yet. Mirrors SmsReview's
// edit modal (same reg/OT recompute, same shape) but as a full page to match
// Mobile's existing navigation pattern instead of a modal, and scoped to the
// logged-in employee's own submission — no employee picker, date is fixed to
// whatever day this was opened from.
export default function PendingEntryEdit({ employee }) {
  const navigate = useNavigate()
  const { subId } = useParams()
  const [jobs, setJobs] = useState([])
  const [sub, setSub] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const [timeIn, setTimeIn] = useState('')
  const [timeOut, setTimeOut] = useState('')
  const [lunchMinutes, setLunchMinutes] = useState('')
  const [amPmNote, setAmPmNote] = useState('')
  const [perDiemLocation, setPerDiemLocation] = useState('')
  const [entries, setEntries] = useState([blankEntry()])
  const [supplies, setSupplies] = useState([blankSupply()])
  const [photos, setPhotos] = useState([])
  const [photoJobNumber, setPhotoJobNumber] = useState(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [addingPhoto, setAddingPhoto] = useState(false)
  const [openPhoto, setOpenPhoto] = useState(null)

  useEffect(() => {
    supabase.schema('Cores').from('jobs').select('id, job_number, description, vessels(name)').order('job_number').then(({ data }) => setJobs(data || []))
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data } = await supabase.schema('Cores').from('sms_submissions')
        .select('*').eq('id', subId).eq('employee_id', employee.id).single()
      if (cancelled) return
      if (!data) { setError('Submission not found'); setLoading(false); return }
      if (data.status === 'approved') { setError('locked'); setSub(data); setLoading(false); return }
      setSub(data)
      setTimeIn(data.time_in ? data.time_in.substring(0, 5) : '')
      setTimeOut(data.stated_time_out ? data.stated_time_out.substring(0, 5) : '')
      setLunchMinutes(data.lunch_minutes != null ? String(data.lunch_minutes) : '')
      setPerDiemLocation(data.per_diem_location || '')
      setEntries((data.entries || []).length > 0 ? data.entries.map(e => ({
        job_number: e.job_number || '', hours: e.hours != null ? String(e.hours) : '', description: e.description || '',
      })) : [blankEntry()])
      setSupplies((data.supplies || []).length > 0 ? data.supplies.map(s => ({
        job_number: s.job_number || '', supply_name: s.supply_name || '', quantity: s.quantity != null ? String(s.quantity) : '1',
      })) : [blankSupply()])
      loadPhotos(data.work_date)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [subId, employee.id])

  async function loadPhotos(ymd) {
    const { data } = await supabase.schema('Cores').from('gear_photos')
      .select('*').eq('employee_id', employee.id).eq('work_date', ymd)
      .order('created_at', { ascending: false })
    setPhotos(data || [])
  }

  // Adding a photo here saves it straight away, same as "+ Photo" on the day
  // card — it's its own gear_photos row, not part of this day's text, so
  // Save/Cancel below don't touch it. Job defaults to the day's only job.
  const entryJobNumbers = [...new Set(entries.map(e => e.job_number.trim()).filter(Boolean))]
  const photoJob = photoJobNumber ?? (entryJobNumbers.length === 1 ? entryJobNumbers[0] : '')
  async function uploadPhotos(files) {
    setUploadingPhoto('Uploading…'); setError('')
    const job = photoJob ? jobs.find(j => j.job_number === photoJob) || null : null
    const { error: err } = await addTechPhotos(supabase, {
      employeeId: employee.id, ymd: sub.work_date, job, files,
      onProgress: (n, total) => setUploadingPhoto(total > 1 ? `Uploading ${n} of ${total}…` : 'Uploading…'),
    })
    await loadPhotos(sub.work_date)
    if (err) setError(err.message)
    else { setAddingPhoto(false); setPhotoJobNumber(null) }
    setUploadingPhoto(false)
  }

  const setEntryField = (i, field, value) => setEntries(rows => rows.map((r, j) => j === i ? { ...r, [field]: value } : r))
  const setSupplyField = (i, field, value) => setSupplies(rows => rows.map((r, j) => j === i ? { ...r, [field]: value } : r))

  // Phone left the picker on the wrong AM/PM (see fixShiftAmPm) — correct it
  // in the fields and tell the tech, rather than sending 4:00 AM to the office.
  function checkAmPm() {
    const hours = entries.reduce((s, e) => s + (Number(e.hours) || 0), 0)
    const fix = fixShiftAmPm(timeIn, timeOut, hours, lunchMinutes)
    if (!fix.changed) return
    setTimeIn(fix.time_in); setTimeOut(fix.time_out)
    setAmPmNote(amPmFixNote(fix))
  }

  async function saveEdit() {
    const cleaned = entries
      .filter(e => e.job_number.trim() || e.description.trim() || e.hours !== '')
      .map(e => ({ job_number: e.job_number.trim(), hours: Number(e.hours) || 0, description: e.description.trim() }))

    if (cleaned.some(e => !e.job_number)) { setError('Every entry needs a job'); return }
    if (cleaned.some(e => !(Number(e.hours) >= 0))) { setError('Hours can\'t be blank (0 is fine for a day off)'); return }
    if (cleaned.length === 0) { setError('Add at least one job'); return }
    if (cleaned.some(e => !e.description)) { setError('Add a note describing what was done for each job'); return }
    setSaving(true); setError('')

    const { statDay, dailyOTThreshold, alreadyWorked: startAlready } = await fetchDailyOTContext(supabase, employee.id, sub.work_date)
    let alreadyWorked = startAlready
    const entriesWithOT = cleaned.map(e => {
      const { reg, ot } = computeDailyOTSplit(e.hours, alreadyWorked, dailyOTThreshold, statDay)
      alreadyWorked += e.hours
      return { ...e, reg_hours: Math.round(reg * 100) / 100, ot_hours: Math.round(ot * 100) / 100 }
    })

    const cleanedSupplies = supplies
      .filter(s => s.supply_name.trim())
      .map(s => ({
        job_number: s.job_number.trim(),
        supply_name: s.supply_name.trim(),
        quantity: Number(s.quantity) > 0 ? Number(s.quantity) : 1,
      }))

    // Backstop for checkAmPm() — the onBlur that normally catches it can be skipped
    const ampm = fixShiftAmPm(timeIn, timeOut, entriesWithOT.reduce((s, e) => s + e.hours, 0), lunchMinutes)
    const updates = {
      time_in: ampm.time_in || null,
      stated_time_out: ampm.time_out || null,
      lunch_minutes: lunchMinutes !== '' ? Number(lunchMinutes) : null,
      per_diem_location: perDiemLocation.trim() || null,
      entries: entriesWithOT,
      supplies: cleanedSupplies,
      calculated_time_out: null,
      delta_minutes: null,
      pending_questions: [],
      // Editing it yourself answers whatever the bot was waiting on, and if the
      // office had declined it, fixing it up puts it back in front of them.
      status: sub.status === 'approved' ? sub.status : 'submitted',
      updated_at: new Date().toISOString(),
    }

    const totalHours = entriesWithOT.reduce((s, e) => s + e.hours, 0)
    if (updates.time_in && totalHours > 0) {
      const [h, m] = updates.time_in.split(':').map(Number)
      const lunchMins = Number(updates.lunch_minutes) || 0
      const outMins = h * 60 + m + Math.round(totalHours * 60) + lunchMins
      const oh = Math.floor(outMins / 60) % 24
      const om = outMins % 60
      updates.calculated_time_out = `${String(oh).padStart(2, '0')}:${String(om).padStart(2, '0')}`
      if (updates.stated_time_out) {
        const [sh, sm] = updates.stated_time_out.split(':').map(Number)
        updates.delta_minutes = (sh * 60 + sm) - outMins
      }
    }

    const { error: err } = await supabase.schema('Cores').from('sms_submissions')
      .update(updates).eq('id', sub.id).eq('employee_id', employee.id)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false)
    navigate('..')
  }

  async function discard() {
    setSaving(true)
    const { error: err } = await supabase.schema('Cores').from('sms_submissions')
      .delete().eq('id', sub.id).eq('employee_id', employee.id)
    if (err) { setError(err.message); setSaving(false); return }
    navigate('..')
  }

  if (loading) return <div className="emp-main"><div className="emp-empty">Loading…</div></div>

  if (error === 'locked') {
    return (
      <div className="emp-main">
        <a className="emp-back-link" onClick={() => navigate('..')}>‹ Back</a>
        <div className="emp-card">
          <div className="emp-empty">🔒 This day's already been approved — the office will need to make any changes now.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="emp-main">
      <a className="emp-back-link" onClick={() => navigate('..')}>‹ Back</a>
      <div className="emp-card">
        {error && <div className="emp-error">{error}</div>}
        {sub && <div className="emp-hint" style={{ marginTop: 0, marginBottom: '0.75rem' }}>{friendlyDate(sub.work_date)} — texted in, not yet approved</div>}

        <div className="emp-row-2">
          <div className="emp-field">
            <label>Time in</label>
            <input type="time" value={timeIn} onChange={e => setTimeIn(e.target.value)} onBlur={checkAmPm} />
          </div>
          <div className="emp-field">
            <label>Time out</label>
            <input type="time" value={timeOut} onChange={e => setTimeOut(e.target.value)} onBlur={checkAmPm} />
          </div>
        </div>
        {amPmNote && <div className="emp-ampm-note">{amPmNote}</div>}

        <div className="emp-row-2">
          <div className="emp-field">
            <label>Lunch (min)</label>
            <input type="number" min="0" step="5" value={lunchMinutes} onChange={e => setLunchMinutes(e.target.value)} />
          </div>
          <div className="emp-field">
            <label>Per diem</label>
            <input type="text" placeholder='"none" or hotel name' value={perDiemLocation} onChange={e => setPerDiemLocation(e.target.value)} />
          </div>
        </div>

        {entries.map((line, i) => (
          <div className="emp-job-line" key={i}>
            {entries.length > 1 && (
              <button className="emp-remove-line" onClick={() => setEntries(rows => rows.filter((_, idx) => idx !== i))}>Remove</button>
            )}
            <div className="emp-field">
              <label>Job</label>
              <JobPicker jobs={jobs} value={line.job_number} onChange={(job) => setEntryField(i, 'job_number', job.job_number)} />
            </div>
            <div className="emp-field">
              <label>Hours</label>
              <input type="number" step="0.25" min="0" value={line.hours} onChange={e => setEntryField(i, 'hours', e.target.value)} />
            </div>
            <div className="emp-field">
              <label>Notes</label>
              <AutoGrowTextarea value={line.description} onChange={e => setEntryField(i, 'description', e.target.value)} />
            </div>
          </div>
        ))}
        {/* "+ Photo" sits beside "+ Add another job", same as a new day on the
            home screen; its job picker opens underneath. */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="emp-btn emp-btn-secondary emp-btn-small" onClick={() => setEntries(rows => [...rows, blankEntry()])}>+ Add another job</button>
          {!addingPhoto && (
            <button className="emp-btn emp-btn-secondary emp-btn-small"
              onClick={() => { setAddingPhoto(true); setError('') }}>+ Photo</button>
          )}
        </div>
        {addingPhoto && (
          <div style={{ marginTop: '0.5rem' }}>
            <div className="emp-field">
              <label>Job this photo is for (optional)</label>
              <JobPicker jobs={jobs} value={photoJob} onChange={(job) => setPhotoJobNumber(job.job_number)} placeholder="No job — office will sort it out" />
              {photoJob && (
                <button type="button" className="emp-inline-link" style={{ marginTop: '0.3rem', fontSize: '0.8rem' }}
                  onClick={() => setPhotoJobNumber('')}>Clear job</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {/* Same visible-but-transparent file input as the day card's "+ Photo"
                  — display:none blocks the native picker on iOS Safari. */}
              <label className="emp-btn" style={{ position: 'relative', overflow: 'hidden', opacity: uploadingPhoto ? 0.5 : 1 }}>
                {uploadingPhoto || 'Take / choose photos or videos'}
                <input type="file" accept="image/*,video/*" multiple disabled={!!uploadingPhoto}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0 }}
                  onChange={e => { const fs = [...(e.target.files || [])]; e.target.value = ''; if (fs.length) uploadPhotos(fs) }} />
              </label>
              <button className="emp-btn emp-btn-secondary" disabled={!!uploadingPhoto}
                onClick={() => { setAddingPhoto(false); setPhotoJobNumber(null) }}>Cancel</button>
            </div>
          </div>
        )}
        <PhotoThumbs photos={photos} onOpen={setOpenPhoto} style={{ marginTop: '0.5rem' }} />
        {photos.length > 0 && <div className="emp-hint">Tap a photo to change its job or caption, or delete it. Photo changes save straight away.</div>}

        <div style={{ marginTop: '1rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#444' }}>Supplies used (optional)</label>
          {supplies.map((line, i) => {
            return (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.4rem' }}>
                <div className="emp-row-2" style={{ flex: 1 }}>
                  <select value={line.job_number} onChange={e => setSupplyField(i, 'job_number', e.target.value)}>
                    <option value="">Job…</option>
                    {entryJobNumbers.map(jn => <option key={jn} value={jn}>{jn}</option>)}
                  </select>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <input type="text" placeholder="Fill in supply name" value={line.supply_name}
                      onChange={e => setSupplyField(i, 'supply_name', e.target.value)} style={{ flex: 1 }} />
                    <input type="number" min="0" step="0.5" value={line.quantity}
                      onChange={e => setSupplyField(i, 'quantity', e.target.value)} style={{ width: '4.5rem' }} />
                  </div>
                </div>
                <button className="emp-remove-line" style={{ position: 'static' }}
                  onClick={() => setSupplies(rows => rows.filter((_, idx) => idx !== i))}>Remove</button>
              </div>
            )
          })}
          <button className="emp-btn emp-btn-secondary emp-btn-small" style={{ marginTop: '0.5rem' }}
            onClick={() => setSupplies(rows => [...rows, blankSupply()])}>+ Add supply</button>
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <button className="emp-btn" disabled={saving} onClick={saveEdit}>{saving ? 'Saving…' : 'Save'}</button>
          <button className="emp-btn emp-btn-secondary" disabled={saving} onClick={() => navigate('..')}>Cancel</button>
          {confirmDiscard ? (
            <div style={{ textAlign: 'center', fontSize: '0.9rem' }}>
              Discard this day's text?{' '}
              <button className="emp-inline-link" style={{ color: '#c0392b' }} disabled={saving} onClick={discard}>Yes, discard</button>
              {' / '}
              <button className="emp-inline-link" onClick={() => setConfirmDiscard(false)}>Cancel</button>
            </div>
          ) : (
            <button className="emp-btn emp-btn-danger" disabled={saving} onClick={() => setConfirmDiscard(true)}>Discard this day's text</button>
          )}
        </div>
      </div>
      {openPhoto && (
        <PhotoEditSheet photo={openPhoto} jobs={jobs} employeeId={employee.id}
          onClose={() => setOpenPhoto(null)} onChanged={() => loadPhotos(sub.work_date)} />
      )}
    </div>
  )
}
