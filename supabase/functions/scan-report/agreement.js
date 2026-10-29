// Two-read agreement (Jim's rule: IF YOU DON'T KNOW, DON'T GUESS).
// The scan is read twice by two separate Claude calls. A cell keeps a value
// only when both reads returned the exact same text; anything else comes back
// empty and flagged, carrying every candidate either read saw.
//
// Plain JS (no Deno or Node APIs) so scripts/test-xlsx-fill.mjs can unit-test it.

// A cell as one read returns it: { value, unsure_reading, note } (all string|null).
const clean = (s) => (typeof s === 'string' && s.trim() !== '' ? s.trim() : null)

function readCell(raw) {
  if (!raw || typeof raw !== 'object') return { value: null, unsure_reading: null, note: null, missing: true }
  return { value: clean(raw.value), unsure_reading: clean(raw.unsure_reading), note: clean(raw.note), missing: false }
}

// Merged cell: { value, unsure, candidates, note }.
//   value      — the agreed text, or null
//   unsure     — true when the reads disagreed or either read was unsure
//   candidates — every distinct reading either read offered (only when unsure)
//   note       — notes from both reads, labelled when they differ
export function mergeCell(rawA, rawB) {
  const a = readCell(rawA)
  const b = readCell(rawB)

  const notes = []
  if (a.missing) notes.push('Read 1 left this cell out')
  if (b.missing) notes.push('Read 2 left this cell out')
  if (a.note && b.note && a.note === b.note) notes.push(a.note)
  else {
    if (a.note) notes.push(`Read 1: ${a.note}`)
    if (b.note) notes.push(`Read 2: ${b.note}`)
  }
  const note = notes.length ? notes.join(' | ') : null

  // Agreement: both reads gave a value and it is the same text, character for
  // character (so "1.751" and "1.7510" disagree — decimals are kept as written).
  if (a.value !== null && a.value === b.value && !a.unsure_reading && !b.unsure_reading) {
    return { value: a.value, unsure: false, candidates: [], note }
  }

  // Both reads saw an empty box and had nothing to say about it.
  const nothing = (c) => c.value === null && c.unsure_reading === null && !c.missing
  if (nothing(a) && nothing(b) && !a.note && !b.note) {
    return { value: null, unsure: false, candidates: [], note: null }
  }

  const candidates = []
  for (const s of [a.value, a.unsure_reading, b.value, b.unsure_reading]) {
    if (s !== null && !candidates.includes(s)) candidates.push(s)
  }
  return { value: null, unsure: true, candidates, note }
}

// Merges two whole reads of a sheet, walking the template's read spec (not the
// reads) so a cell one read skipped still shows up, flagged.
export function mergeReads(readA, readB, spec) {
  const A = readA || {}
  const B = readB || {}

  const header = {}
  for (const key of Object.keys(spec.header)) {
    header[key] = mergeCell(A.header?.[key], B.header?.[key])
  }

  const column_headings = []
  for (let i = 0; i < spec.columns; i++) {
    column_headings.push(mergeCell(A.column_headings?.[i], B.column_headings?.[i]))
  }

  const grid = {}
  for (const section of spec.sections) {
    grid[section.key] = {}
    for (const row of section.rows) {
      const cells = []
      for (let i = 0; i < spec.columns; i++) {
        cells.push(mergeCell(A.grid?.[section.key]?.[row]?.[i], B.grid?.[section.key]?.[row]?.[i]))
      }
      grid[section.key][row] = cells
    }
  }

  // General notes from either read (e.g. "two sheets in this PDF, read the first").
  const general_notes = []
  for (const [n, r] of [[1, A], [2, B]]) {
    for (const s of Array.isArray(r.general_notes) ? r.general_notes : []) {
      const t = clean(s)
      if (t) general_notes.push(`Read ${n}: ${t}`)
    }
  }

  return { header, column_headings, grid, general_notes }
}
