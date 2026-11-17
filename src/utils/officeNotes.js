// Office notes sent from SMS Review ("✉️ Send Note") go out as a text and are
// kept in the day's raw_messages as an 'out' message starting with this
// prefix (sms-timesheet's send_admin_note action). Techs often missed them —
// app-logged days never showed the note at all — so Niki ended up texting
// from her own phone (Jim, 2026-11-17).
const OFFICE_NOTE_PREFIX = 'Office note re:'

// The office's latest note on a pending day that the tech hasn't answered
// yet, or null. Answered = any later message from the tech: a text reply, the
// app's "Submitted via app" line written when they close an edit, or the
// "Done" button on the note itself.
export function openOfficeNote(sub) {
  if (!sub || !['submitted', 'collecting'].includes(sub.status)) return null
  const msgs = sub.raw_messages || []
  let idx = -1
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]?.direction === 'out' && String(msgs[i].text || '').startsWith(OFFICE_NOTE_PREFIX)) { idx = i; break }
  }
  if (idx < 0) return null
  if (msgs.slice(idx + 1).some(m => m?.direction === 'in')) return null
  const text = String(msgs[idx].text).replace(/^Office note re:.*?timesheet\s*—\s*/, '')
  return { text, ts: msgs[idx].ts || null }
}

// Every pending day, any week, with an office note the tech hasn't answered.
// Sent-back (rejected) days are left out on purpose: the office's Delete
// button also stores 'rejected' (duplicates, cleared stuck drafts), so most of
// them need nothing from the tech; those days keep their own red chip.
export function daysWaitingOnTech(subs) {
  return (subs || [])
    .map(sub => {
      const note = openOfficeNote(sub)
      return note ? { id: sub.id, work_date: sub.work_date, text: note.text } : null
    })
    .filter(Boolean)
    .sort((a, b) => a.work_date.localeCompare(b.work_date))
}
