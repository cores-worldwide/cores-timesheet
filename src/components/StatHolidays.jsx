import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { payWeekRange } from '../utils/statPay'

const cores = () => supabase.schema('Cores')

const inputStyle = { padding: '0.45rem 0.7rem', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.9rem', boxSizing: 'border-box' }
const btnPrimary = { padding: '0.45rem 1.1rem', background: '#0066cc', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }
const btnSecondary = { padding: '0.45rem 1.1rem', background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }
const btnDanger = { padding: '0.3rem 0.8rem', background: '#fff', color: '#c0392b', border: '1px solid #e0b0b0', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }
const thStyle = { padding: '0.75rem', textAlign: 'left', fontWeight: 600, color: '#555', borderBottom: '2px solid #ddd', background: '#f5f5f5' }
const tdStyle = { padding: '0.75rem', borderBottom: '1px solid #eee', color: '#333' }

const toYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const asDate = (ymd) => new Date(ymd + 'T12:00:00')
const fmtDate = (ymd) => asDate(ymd).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
const isWeekendYMD = (ymd) => [0, 6].includes(asDate(ymd).getDay())
const todayYMD = () => toYMD(new Date())

// Holidays that keep the same calendar date every year. Anything else that
// fell on a Monday is assumed to be "nth Monday of the month" (Heritage Day,
// Labour Day, ...), and Good Friday follows Easter. The office checks and can
// change every suggested date before saving.
const FIXED_DATE = /new year|canada day|remembrance|christmas|boxing|truth|reconciliation/i

function easterSunday(year) {
  // Anonymous Gregorian algorithm
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day, 12)
}

function suggestDate(holiday, year) {
  const src = asDate(holiday.holiday_date)
  if (/good friday/i.test(holiday.name)) {
    const d = easterSunday(year)
    d.setDate(d.getDate() - 2)
    return toYMD(d)
  }
  if (/victoria/i.test(holiday.name)) {
    // Monday before May 25
    const d = new Date(year, 4, 24, 12)
    d.setDate(24 - ((d.getDay() + 6) % 7))
    return toYMD(d)
  }
  if (!FIXED_DATE.test(holiday.name) && src.getDay() === 1) {
    const nth = Math.ceil(src.getDate() / 7)
    const d = new Date(year, src.getMonth(), 1, 12)
    d.setDate(1 + ((1 - d.getDay() + 7) % 7) + (nth - 1) * 7)
    return toYMD(d)
  }
  return toYMD(new Date(year, src.getMonth(), src.getDate(), 12))
}

export default function StatHolidays() {
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(true)
  const [newDate, setNewDate] = useState('')
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [copyRows, setCopyRows] = useState(null) // preview for "Copy to next year"

  async function load() {
    const { data, error } = await cores().from('stat_holidays').select('*').order('holiday_date')
    if (error) { alert('Failed to load stat holidays: ' + error.message); return }
    setHolidays(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Pay already worked out (or being worked out) for that date — changing the
  // list doesn't redo past stat-pay requests or OT, so say so before saving.
  function pastWarning(ymd) {
    const [weekStart, weekEnd] = payWeekRange(todayYMD())
    if (ymd < weekStart) return `${fmtDate(ymd)} is in a past pay week. Stat pay and OT already worked out for that week won't be redone.`
    if (ymd <= weekEnd) return `${fmtDate(ymd)} is in the current pay week.`
    return null
  }

  async function addHoliday() {
    const name = newName.trim()
    if (!newDate || !name) { alert('Pick a date and type a name.'); return }
    if (holidays.some(h => h.holiday_date === newDate)) { alert(`${fmtDate(newDate)} is already a stat holiday.`); return }
    const warnings = []
    if (isWeekendYMD(newDate)) warnings.push(`${fmtDate(newDate)} falls on a weekend.`)
    const past = pastWarning(newDate)
    if (past) warnings.push(past)
    if (warnings.length && !confirm(warnings.join('\n\n') + '\n\nAdd it anyway?')) return
    setSaving(true)
    const { error } = await cores().from('stat_holidays').insert({ holiday_date: newDate, name })
    setSaving(false)
    if (error) { alert('Failed to add holiday: ' + error.message); return }
    setNewDate('')
    setNewName('')
    load()
  }

  async function deleteHoliday(h) {
    // Stat-pay requests are created ahead of time for everyone who works that
    // pay week, so a removed holiday would leave them stranded in SMS Review.
    const [pendingRes, grantedRes] = await Promise.all([
      cores().from('sms_submissions').select('id')
        .eq('is_stat_grant', true).eq('work_date', h.holiday_date).in('status', ['submitted', 'collecting']),
      cores().from('timesheet_entries').select('id')
        .eq('is_stat_pay', true).eq('work_date', h.holiday_date),
    ])
    if (pendingRes.error || grantedRes.error) {
      alert('Failed to check stat pay for this day: ' + (pendingRes.error || grantedRes.error).message)
      return
    }
    const pending = pendingRes.data || []
    const granted = grantedRes.data || []
    let msg = `Remove ${h.name} (${fmtDate(h.holiday_date)}, ${h.holiday_date.slice(0, 4)}) from the stat holidays?`
    if (pending.length) msg += `\n\n${pending.length} stat pay request${pending.length > 1 ? 's' : ''} waiting in SMS Review for this day will be removed too.`
    if (granted.length) msg += `\n\n${granted.length} approved stat pay entr${granted.length > 1 ? 'ies' : 'y'} for this day will NOT be removed. Delete ${granted.length > 1 ? 'them' : 'it'} on the Timesheets tab if ${granted.length > 1 ? 'they' : 'it'} shouldn't be paid.`
    const past = pastWarning(h.holiday_date)
    if (past) msg += `\n\n${past}`
    if (!confirm(msg)) return

    setSaving(true)
    if (pending.length) {
      const { error } = await cores().from('sms_submissions').delete().in('id', pending.map(p => p.id))
      if (error) { setSaving(false); alert('Failed to remove the stat pay requests: ' + error.message); return }
    }
    const { error } = await cores().from('stat_holidays').delete().eq('id', h.id)
    setSaving(false)
    if (error) { alert('Failed to remove holiday: ' + error.message); return }
    load()
  }

  const years = [...new Set(holidays.map(h => h.holiday_date.slice(0, 4)))].sort()
  const lastYear = years.length ? years[years.length - 1] : String(new Date().getFullYear())
  const nextYear = String(Number(lastYear) + 1)

  function startCopy() {
    setCopyRows(holidays
      .filter(h => h.holiday_date.startsWith(lastYear))
      .map(h => ({ name: h.name, holiday_date: suggestDate(h, Number(nextYear)) })))
  }

  async function saveCopy() {
    const rows = copyRows.map(r => ({ ...r, name: r.name.trim() })).filter(r => r.holiday_date && r.name)
    if (rows.some(r => !r.holiday_date.startsWith(nextYear))) { alert(`Every date must be in ${nextYear}.`); return }
    if (new Set(rows.map(r => r.holiday_date)).size !== rows.length) { alert('Two holidays have the same date.'); return }
    setSaving(true)
    const { error } = await cores().from('stat_holidays').insert(rows)
    setSaving(false)
    if (error) { alert('Failed to add holidays: ' + error.message); return }
    setCopyRows(null)
    load()
  }

  if (loading) return <p style={{ color: '#888' }}>Loading…</p>

  return (
    <div style={{ maxWidth: '760px' }}>
      <p style={{ color: '#555', marginTop: 0 }}>
        Anyone who works in a pay week with a stat holiday gets an automatic 8-hour stat pay request in SMS Review,
        and hours worked on the holiday itself are all OT.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={inputStyle} />
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Holiday name"
          onKeyDown={e => e.key === 'Enter' && addHoliday()}
          style={{ ...inputStyle, flex: 1, minWidth: '180px' }} />
        <button style={btnPrimary} onClick={addHoliday} disabled={saving}>+ Add Holiday</button>
      </div>
      {newDate && isWeekendYMD(newDate) && (
        <p style={{ color: '#b45309', marginTop: '-1rem', fontSize: '0.875rem' }}>⚠ {fmtDate(newDate)} falls on a weekend.</p>
      )}

      {years.length === 0 && <p style={{ color: '#888' }}>No stat holidays yet.</p>}

      {years.map(y => (
        <div key={y} style={{ marginBottom: '1.75rem' }}>
          <h3 style={{ margin: '0 0 0.5rem' }}>{y}</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: '160px' }}>Date</th>
                <th style={thStyle}>Holiday</th>
                <th style={{ ...thStyle, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {holidays.filter(h => h.holiday_date.startsWith(y)).map(h => (
                <tr key={h.id} style={{ color: h.holiday_date < todayYMD() ? '#999' : undefined }}>
                  <td style={{ ...tdStyle, color: 'inherit' }}>
                    {fmtDate(h.holiday_date)}
                    {isWeekendYMD(h.holiday_date) && <span title="Falls on a weekend" style={{ color: '#b45309', marginLeft: '0.4rem' }}>⚠</span>}
                  </td>
                  <td style={{ ...tdStyle, color: 'inherit' }}>{h.name}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button style={btnDanger} onClick={() => deleteHoliday(h)} disabled={saving}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {!copyRows && years.length > 0 && (
        <button style={btnSecondary} onClick={startCopy}>Copy {lastYear} to {nextYear}</button>
      )}

      {copyRows && (
        <div style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '1rem', background: '#fafafa' }}>
          <h3 style={{ marginTop: 0 }}>{nextYear} — check every date before saving</h3>
          <p style={{ color: '#555', fontSize: '0.875rem', marginTop: 0 }}>
            Dates are a best guess (same date, same Monday of the month, or Good Friday from Easter). Change any that are wrong, or clear a name to leave that holiday out.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
            <tbody>
              {copyRows.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...tdStyle, width: '170px' }}>
                    <input type="date" value={r.holiday_date} style={inputStyle}
                      onChange={e => setCopyRows(rows => rows.map((x, j) => j === i ? { ...x, holiday_date: e.target.value } : x))} />
                  </td>
                  <td style={{ ...tdStyle, width: '90px', color: isWeekendYMD(r.holiday_date) ? '#b45309' : '#555' }}>
                    {r.holiday_date && asDate(r.holiday_date).toLocaleDateString('en-CA', { weekday: 'short' })}
                    {r.holiday_date && isWeekendYMD(r.holiday_date) && ' ⚠'}
                  </td>
                  <td style={tdStyle}>
                    <input value={r.name} style={{ ...inputStyle, width: '100%' }}
                      onChange={e => setCopyRows(rows => rows.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button style={btnPrimary} onClick={saveCopy} disabled={saving}>Save {nextYear}</button>
            <button style={btnSecondary} onClick={() => setCopyRows(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
