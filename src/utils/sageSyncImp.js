// Exports the Sage Report rows as a Sage 50 Canadian Edition .IMP file (the
// Time Slips import format) — a plain-text, comma-separated, double-quoted
// structure, NOT csv despite the look of it (the extension matters: Sage
// only accepts .imp, and a renamed .csv with the same content is rejected).
//
// FIRST DRAFT, UNVERIFIED — Jim, 2026-09-12: "create the imp file... We can
// modify it later once Condo[n] confirms the format." Sage's own public
// docs only show a minimal 3-field example per Timeslip detail line
// (Customer, Item, Time) and don't confirm whether Description/Billing
// Status/Billable Amount/Payroll Time are additional real fields on that
// same line or encoded some other way (e.g. implied by the Item code). This
// generator only emits the THREE confirmed fields per detail line rather
// than guess at more commas that could make Sage reject the whole file.
// Everything below marked "UNCONFIRMED" is a best-guess from the one
// example Sage's KB shows and needs checking against a real import attempt
// (or, better, a real Time Slips batch exported from Sage itself, which
// would show the authoritative field set).
//
// Structure (from Sage's own KB — see PR description for sources):
//   <Version>
//   "<version code>", "<country code>"
//   </Version>
//
//   <Timeslip>
//   "<Employee Name>"
//   "<option>","<ref/ticket #>","<M-D-YYYY>"
//   "<Customer>","<Item code>","<HH:MM:SS>"
//   ...one detail line per job/item worked that day...
//   </Timeslip>
//
// One <Timeslip> block per (employee, work_date) — matches how Sage's own
// Time Slips Journal groups a single transaction per employee per entry
// (see the reference screenshot: "Using recurring transaction Joey Hunter
// 4866" was one employee's one transaction with multiple detail lines).

// UNCONFIRMED: "32101" was the documented example for the 2025 version;
// Sage bumps this yearly and we don't know the 2026 code. "1" = Canada,
// per the same doc (2=USA, 3=France, 5=Australia, 7=International).
const VERSION_LINE = '"32101", "1"'

function csvQuote(value) {
  // Sage's own example never shows an escaped quote inside a value, so this
  // is a guess at the safe thing to do (double the quote, standard CSV
  // convention) rather than leaving a literal unescaped quote that could
  // break the line — flagged for the same reason as everything else here.
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

// M-D-YYYY, no zero-padding — matches the one date example Sage's KB shows
// ("3-15-2001"), not our usual YYYY-MM-DD.
function impDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${m}-${d}-${y}`
}

function hhmmss(hours) {
  const totalSeconds = Math.round(Number(hours || 0) * 3600)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// rows: same shape the PDF/on-screen table use — [{ employeeId, employeeName, date, customer, item, actualTime, ... }]
export function generateSageSyncIMP({ dateFrom, dateTo, rows }) {
  const lines = []
  // Plain ASCII only in anything that lands in the file, comment included -
  // this is a legacy Windows text-import parser and there's no confirmation
  // it tolerates non-ASCII bytes even inside a comment line. Sage's docs
  // say only that a line starting with "<!" is a comment, not that it needs
  // HTML-style closing syntax, so kept to the literal confirmed form.
  lines.push('<! FIRST DRAFT - unverified against a real Sage import. See sageSyncImp.js for what is confirmed vs guessed.')
  lines.push('<Version>')
  lines.push(VERSION_LINE)
  lines.push('</Version>')
  lines.push('')

  // Group into one <Timeslip> block per (employee, date), preserving the
  // same employee/date/job ordering already used on screen and in the PDF.
  const groups = new Map()
  rows.forEach(r => {
    const key = `${r.employeeId}|${r.date}`
    if (!groups.has(key)) groups.set(key, { employeeName: r.employeeName, date: r.date, lines: [] })
    groups.get(key).lines.push(r)
  })

  // Short, unique-enough reference per transaction — UNCONFIRMED whether
  // Sage requires this to be unique across the whole file, unique per
  // employee, or just non-blank; using the date + a running index per
  // group's position in the file to guarantee uniqueness either way.
  let ticketCounter = 0
  groups.forEach(group => {
    ticketCounter += 1
    const ref = `${group.date.replace(/-/g, '')}-${String(ticketCounter).padStart(4, '0')}`
    lines.push('<Timeslip>')
    lines.push(csvQuote(group.employeeName))
    // UNCONFIRMED: "2" is copied verbatim from Sage's one example — its
    // actual meaning (a transaction type/option flag) isn't documented
    // anywhere public we found.
    lines.push(`"2",${csvQuote(ref)},${csvQuote(impDate(group.date))}`)
    group.lines.forEach(r => {
      // UNCONFIRMED: item codes are shown without a space in Sage's example
      // ("C1020"), but our own Item values carry one ("Z 200") to match the
      // on-screen Sage UI — stripped here on the assumption the space is
      // just UI formatting, not part of the stored code.
      lines.push(`${csvQuote(r.customer)},${csvQuote(String(r.item || '').replace(/\s+/g, ''))},${csvQuote(hhmmss(r.actualTime))}`)
    })
    lines.push('</Timeslip>')
    lines.push('')
  })

  const content = lines.join('\r\n')
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sage-sync_${dateFrom}_to_${dateTo}.imp`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
