// Report templates for the Scan to Report tab, defined only in code.
//
// Adding a template:
//   1. Put the blank .xlsx in public/report-templates/.
//   2. Add an entry here with its cell map (cells are the top-left cell of
//      each merged range, on the first sheet).
//   3. Measure its `zoom` geometry on a real scan (see below).
//   4. Add the matching read spec (same id and keys) to
//      supabase/functions/scan-report/templates.js and redeploy scan-report.
// scripts/test-xlsx-fill.mjs checks the two lists agree.

// Measurement columns 1-8: each a merged 5-column range starting here.
const VALVE_TRAIN_COLS = ['O', 'T', 'Y', 'AD', 'AI', 'AN', 'AS', 'AX']
const BUSHING_SPEC = ['1.7495', '1.7510']
const SHAFT_SPEC = ['1.7475', '1.7480']

export const REPORT_TEMPLATES = [
  {
    id: 'alco-valve-train-inspection',
    label: 'ALCO Valve Train Inspection (rocker arm & pin)',
    file: 'report-templates/alco-valve-train-inspection.xlsx', // under the Vite base path
    fileSlug: 'valve-train',
    sheet: 'xl/worksheets/sheet1.xml',
    // Only fields that exist on the template (Jim's rule: never add fields).
    header: {
      customer: { cell: 'G4', label: 'Customer' },
      job_no: { cell: 'AG4', label: 'Job No.' },
      date: { cell: 'AW4', label: 'Date' }, // cell has a mmm-yy format; written as text, as on the sheet
      tool: { cell: 'H5', label: 'Tool', prefix: 'Tool- ' }, // label and value share this merged cell
      serial_number: { cell: 'AM5', label: 'Serial Number' },
    },
    columnHeadings: { row: 17, columns: VALVE_TRAIN_COLS, defaults: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'] },
    sections: [
      { key: 'intake_bushing_id', label: 'Intake Rocker Bushing I.D.', rows: { A1: 19, A2: 20, A3: 21, A4: 22 }, spec: BUSHING_SPEC },
      { key: 'intake_shaft_od', label: 'Intake Rocker Shaft O.D.', rows: { B1: 23, B2: 24, B3: 25, B4: 26 }, spec: SHAFT_SPEC },
      { key: 'exhaust_bushing_id', label: 'Exhaust Rocker Bushing I.D.', rows: { A1: 31, A2: 32, A3: 33, A4: 34 }, spec: BUSHING_SPEC },
      { key: 'exhaust_shaft_od', label: 'Exhaust Rocker Shaft O.D.', rows: { B1: 35, B2: 36, B3: 37, B4: 38 }, spec: SHAFT_SPEC },
    ],
    // Where things sit on the scanned paper sheet, for the zoomed crops the
    // reader gets (src/utils/scanViews.js). Units: the upright landscape page
    // scaled to 2000 wide, measured on the 4685 C-block scan of 2026-10-19.
    // Positions are approximate (scans shift a little); pad adds a margin and
    // the reader also gets the whole page to check against.
    zoom: {
      width: 2000,
      pad: 12,
      labelCol: [352, 405],
      cols: [405, 538, 670, 803, 936, 1069, 1202, 1335, 1468], // edges of the 8 measurement columns
      headingRow: [757, 800],
      headerBox: [180, 255, 1540, 362],
      sections: [
        { label: 'Intake Rocker Bushing I.D.', rows: 'A1-A4', y: [830, 982] },
        { label: 'Intake Rocker Shaft O.D.', rows: 'B1-B4', y: [980, 1132] },
        { label: 'Exhaust Rocker Bushing I.D.', rows: 'A1-A4', y: [1255, 1407] },
        { label: 'Exhaust Rocker Shaft O.D.', rows: 'B1-B4', y: [1405, 1540] },
      ],
    },
  },
]

export const findTemplate = (id) => REPORT_TEMPLATES.find((t) => t.id === id) || null

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const pad = (n) => String(n).padStart(2, '0')

// Turns a date as written on a sheet into YYYYMMDD, or null when it isn't a
// form we can read without guessing. Handles "Oct 19/26", "Oct 19, 2026",
// "19 Oct 2026" and "2026-10-19". All-number forms like 10/19/26 are left
// alone: day/month order is ambiguous.
export function parseWrittenDate(text) {
  const s = String(text || '').trim().toLowerCase()
  if (!s) return null
  const valid = (y, m, d) => {
    const dt = new Date(y, m - 1, d)
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? `${y}${pad(m)}${pad(d)}` : null
  }
  const year = (y) => (y.length === 2 ? 2000 + Number(y) : Number(y))
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]))
  m = s.match(/^([a-z]{3})[a-z]*\.?\s*(\d{1,2})(?:st|nd|rd|th)?\s*[/,\s-]\s*(\d{2}|\d{4})$/)
  if (m && MONTHS.includes(m[1])) return valid(year(m[3]), MONTHS.indexOf(m[1]) + 1, Number(m[2]))
  m = s.match(/^(\d{1,2})\s*[-\s]\s*([a-z]{3})[a-z]*\.?\s*[-\s/,]\s*(\d{2}|\d{4})$/)
  if (m && MONTHS.includes(m[2])) return valid(year(m[3]), MONTHS.indexOf(m[2]) + 1, Number(m[1]))
  return null
}

const fileSafe = (s) => String(s || '').trim().replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')

// Suggested download name: <job>_<block>_<template-slug>_<YYYYMMDD>.xlsx,
// e.g. 1234_C-Block_valve-train_20270105.xlsx. The job number is the first
// run of digits in Job No.; the block is whatever else is written there.
// Falls back to "job" and today's date when the sheet doesn't give them.
export function reportFilename(template, header, today = new Date()) {
  const jobText = header?.job_no?.value || ''
  const jobMatch = jobText.match(/\d{3,}/)
  const job = jobMatch ? jobMatch[0] : 'job'
  const block = fileSafe(jobMatch ? jobText.replace(jobMatch[0], '') : '')
  const written = parseWrittenDate(header?.date?.value)
  const date = written || `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`
  const name = [job, block, template.fileSlug, date].filter(Boolean).join('_') + '.xlsx'
  return { name, usedToday: !written }
}
