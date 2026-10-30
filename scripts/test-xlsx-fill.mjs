// Tests for the Scan to Report tab's offline parts (no Claude, no Supabase):
//   - the two-read agreement logic (supabase/functions/scan-report/agreement.js)
//   - the app's template registry vs the function's read spec
//   - filling the real template .xlsx from a SYNTHETIC reading
//     (src/utils/xlsxFill.js): values in the right cells, merges/drawings/
//     images untouched, number format and yellow unsure fill applied
//
// Usage: npm run test:scan-report [-- out.xlsx]
// Pass a path to also save the filled synthetic file (e.g. to open it in
// Excel or convert it with LibreOffice). All values here are made up.

import { readFile, writeFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { mergeCell, mergeReads } from '../supabase/functions/scan-report/agreement.js'
import { READ_TEMPLATES } from '../supabase/functions/scan-report/templates.js'
import { REPORT_TEMPLATES, findTemplate, parseWrittenDate, reportFilename } from '../src/utils/reportTemplates.js'
import { planCells, fillXlsx, splitRef, UNSURE_FILL } from '../src/utils/xlsxFill.js'

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  if (ok) passed++
  else { failed++; console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const cell = (value, unsure_reading = null, note = null, correction = 'none') => ({ value, unsure_reading, note, correction })

// ── 1. Agreement logic ────────────────────────────────────────────────────
{
  let m = mergeCell(cell('1.7510'), cell('1.7510'))
  check('agree: same text kept', m.value === '1.7510' && !m.unsure)
  m = mergeCell(cell(' 1.7510 '), cell('1.7510'))
  check('agree: surrounding spaces ignored', m.value === '1.7510' && !m.unsure)
  m = mergeCell(cell('1.751'), cell('1.7510'))
  check('disagree: trailing zero matters', m.value === null && m.unsure && eq(m.candidates, ['1.751', '1.7510']))
  m = mergeCell(cell('1.7495'), cell('1.7498'))
  check('disagree: both candidates kept', m.value === null && m.unsure && eq(m.candidates, ['1.7495', '1.7498']))
  m = mergeCell(cell('1.7495'), cell(null, '1.7495', 'ink blot on last digit'))
  check('one read unsure -> unsure', m.value === null && m.unsure && eq(m.candidates, ['1.7495']) && /ink blot/.test(m.note))
  m = mergeCell(cell(null, '1.7502', 'scribble'), cell(null, '1.7502', 'scribble'))
  check('both unsure, same candidate -> still unsure', m.value === null && m.unsure && eq(m.candidates, ['1.7502']) && m.note === 'scribble')
  m = mergeCell(cell(null), cell(null))
  check('both blank -> blank, not flagged', m.value === null && !m.unsure && m.note === null)
  m = mergeCell(cell(null), undefined)
  check('one read missing the cell -> flagged', m.unsure && /Read 2 left this cell out/.test(m.note))
  m = mergeCell(cell('1.7480', null, 'whiteout, rewritten in blue'), cell('1.7480', null, 'neat correction'))
  check('agree with notes -> value kept, notes kept', m.value === '1.7480' && !m.unsure && /Read 1: whiteout/.test(m.note) && /Read 2: neat/.test(m.note))
  m = mergeCell(cell('1.7510', null, null, 'neat'), cell('1.7510', null, null, 'neat'))
  check('neat correction, agreed -> filled, not highlighted', m.value === '1.7510' && m.corrected && !m.check && !m.unsure)
  m = mergeCell(cell('1.7510', null, 'ink spill', 'doubtful'), cell('1.7510', null, null, 'neat'))
  check('doubtful correction, agreed -> filled + check', m.value === '1.7510' && m.corrected && m.check && !m.unsure)
  m = mergeCell(cell('1.7510', null, null, 'doubtful'), cell('1.7516', null, null, 'doubtful'))
  check('correction, reads disagree -> blank + unsure', m.value === null && m.unsure && !m.check)
  m = mergeCell(cell(null, null, 'smudge'), cell(null))
  check('blank but noted -> flagged', m.value === null && m.unsure)

  const spec = READ_TEMPLATES['alco-valve-train-inspection']
  const merged = mergeReads({ header: { job_no: cell('1234 Z-Block') }, column_headings: [cell('L1')], general_notes: ['two sheets'] }, { header: { job_no: cell('1234 Z-Block') }, column_headings: [cell('L1')] }, spec)
  check('mergeReads: walks the spec, not the reads', Object.keys(merged.header).length === 5 && merged.column_headings.length === 8 && merged.grid.exhaust_shaft_od.B4.length === 8)
  check('mergeReads: agreed header kept', merged.header.job_no.value === '1234 Z-Block')
  check('mergeReads: cells missing from both reads are flagged', merged.grid.intake_bushing_id.A1[0].unsure === true)
  check('mergeReads: general notes labelled', eq(merged.general_notes, ['Read 1: two sheets']))
}

// ── 2. Registry vs read spec ──────────────────────────────────────────────
for (const t of REPORT_TEMPLATES) {
  const spec = READ_TEMPLATES[t.id]
  check(`${t.id}: function has a read spec`, !!spec)
  if (!spec) continue
  check(`${t.id}: header keys match`, eq(Object.keys(t.header).sort(), Object.keys(spec.header).sort()))
  check(`${t.id}: column count matches`, t.columnHeadings.columns.length === spec.columns)
  check(`${t.id}: sections match`, eq(t.sections.map((s) => [s.key, Object.keys(s.rows)]), spec.sections.map((s) => [s.key, s.rows])))
}
for (const id of Object.keys(READ_TEMPLATES)) check(`${id}: app has a cell map`, !!findTemplate(id))

// ── 3. Dates and filenames ────────────────────────────────────────────────
check('date: Oct 19/26', parseWrittenDate('Oct 19/26') === '20261019')
check('date: October 3, 2026', parseWrittenDate('October 3, 2026') === '20261003')
check('date: 5 Nov 2026', parseWrittenDate('5 Nov 2026') === '20261105')
check('date: 2026-10-19', parseWrittenDate('2026-10-19') === '20261019')
check('date: ambiguous 10/11/26 refused', parseWrittenDate('10/11/26') === null)
check('date: Feb 30/26 refused', parseWrittenDate('Feb 30/26') === null)
{
  const t = findTemplate('alco-valve-train-inspection')
  let f = reportFilename(t, { job_no: { value: '1234 Z-Block' }, date: { value: 'Jan 5/27' } })
  check('filename: from the sheet', f.name === '1234_Z-Block_valve-train_20270105.xlsx' && !f.usedToday, f.name)
  f = reportFilename(t, { job_no: { value: null }, date: { value: null } }, new Date(2026, 0, 2))
  check('filename: fallbacks', f.name === 'job_valve-train_20260102.xlsx' && f.usedToday, f.name)
}

// ── 4. Filling the real template ──────────────────────────────────────────
const template = findTemplate('alco-valve-train-inspection')
const templateBytes = await readFile(new URL('../public/report-templates/alco-valve-train-inspection.xlsx', import.meta.url))

// A synthetic merged reading (what scan-report returns). Made-up values.
const ok = (value, note = null) => ({ value, unsure: false, candidates: [], note })
const unsure = (candidates, note = null) => ({ value: null, unsure: true, candidates, note })
const blank = () => ({ value: null, unsure: false, candidates: [], note: null })
const row = (vals) => vals.map((v) => (v === '?' ? unsure(['1.7500', '1.7506'], 'Read 1: ink blot') : v === '' ? blank() : ok(v)))
const reading = {
  header: {
    customer: ok('Test Marine Co.'),
    job_no: ok('1234 Z-Block'),
    date: ok('Jan 5/27'),
    tool: ok('1-2" outside & <test>'),
    serial_number: unsure(['SN-0000'], 'Read 1: smudged'),
  },
  column_headings: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8'].map((h) => ok(h)),
  grid: {
    intake_bushing_id: {
      A1: row(['1.7500', '1.7505', '1.7510', '1.7520', '1.7499', '1.7501', '1.7502', '1.7503']),
      A2: row(['1.7500', '?', '1.751', '1.7500', '1.7500', '1.7500', '1.7500', '1.7500']),
      A3: row(['1.7500', '1.7500', '1.7500', '1.7500', '1.7500', '1.7500', '1.7500', '']),
      A4: row(['1.7500', '1.7500', '1.7500', '1.7500', '1.7500', '1.7500', '1.7500', '1.7500']),
    },
    intake_shaft_od: {
      B1: row(['1.7476', '1.7477', '1.7478', '1.7479', '1.7476', '1.7476', '1.7476', '1.7470']),
      B2: row(['1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '1.7476']),
      B3: row(['1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '1.7476']),
      B4: row(['1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '1.7476']),
    },
    exhaust_bushing_id: {
      A1: row(['1.7500', '1.7500', '1.7500', '1.7500', '1.7500', '1.7500', '1.7500', '1.7500']),
      A2: row(['1.7500', '1.7500', '1.7500', '1.7500', '1.7500', '1.7500', '1.7500', '1.7500']),
      A3: row(['1.7500', '1.7500', '1.7500', '1.7500', '1.7500', '1.7500', '1.7500', '1.7500']),
      A4: row(['1.7500', '1.7500', '1.7500', '1.7500', '1.7500', '1.7500', '1.7500', '1.75l0']),
    },
    exhaust_shaft_od: {
      B1: row(['1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '1.7476']),
      B2: row(['1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '1.7476']),
      B3: row(['1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '1.7476']),
      B4: row(['1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '1.7476', '?']),
    },
  },
  general_notes: [],
}
reading.grid.exhaust_bushing_id.A1[0] = ok('1.7500', 'Read 1: neat correction')
reading.grid.exhaust_bushing_id.A1[1] = { ...ok('1.7510', 'Read 1: ink spill'), check: true, corrected: true }

const { writes, summary } = planCells(template, reading)
const { bytes, notesAdded } = await fillXlsx(templateBytes, template.sheet, writes)
const outPath = process.argv[2]
if (outPath) await writeFile(outPath, bytes)

check('summary: filled count', summary.filled === 4 + 8 + 128 - 3, `got ${summary.filled}`) // 3 grid cells unsure/blank
check('summary: unsure list', eq(summary.unsure.map((u) => u.ref).sort(), ['AM5', 'AX38', 'T20'].sort()), JSON.stringify(summary.unsure.map((u) => u.ref)))
check('summary: unsure has candidates', eq(summary.unsure.find((u) => u.ref === 'T20').candidates, ['1.7500', '1.7506']))
check('summary: out of spec', eq(summary.outOfSpec.map((o) => o.ref).sort(), ['AD19', 'AX23']), JSON.stringify(summary.outOfSpec.map((o) => o.ref)))
check('summary: non-number noted', summary.noted.some((n) => n.ref === 'AX34' && /Not a plain number/.test(n.note)))
check('notes added to the workbook', notesAdded)

const before = await JSZip.loadAsync(templateBytes)
const after = await JSZip.loadAsync(bytes)
const sheet = await after.file('xl/worksheets/sheet1.xml').async('string')
const origSheet = await before.file('xl/worksheets/sheet1.xml').async('string')
const styles = await after.file('xl/styles.xml').async('string')

// Every original part is still there; images and drawings byte-identical.
for (const name of Object.keys(before.files)) {
  check(`entry kept: ${name}`, !!after.file(name) || before.files[name].dir)
}
for (const name of Object.keys(before.files).filter((n) => /^xl\/(media|drawings\/(drawing1\.xml|_rels)|theme)\b/.test(n) && !before.files[n].dir)) {
  const a = await before.file(name).async('uint8array')
  const b = await after.file(name).async('uint8array')
  check(`unchanged: ${name}`, Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0)
}
const mergesOf = (x) => (x.match(/<mergeCell ref="[^"]+"/g) || []).join()
check('mergeCells identical', mergesOf(sheet) === mergesOf(origSheet) && /<mergeCells count="198"/.test(sheet))
check('drawing element kept', /<drawing\b[^>]*r:id="rId1"/.test(sheet))
check('sheet rels keep the drawing', (await after.file('xl/worksheets/_rels/sheet1.xml.rels').async('string')).includes('drawing1.xml'))

const cellXml = (ref) => (new RegExp(`<c r="${ref}"(?=[\\s>/])[^>]*?(?:/>|>[\\s\\S]*?</c>)`).exec(sheet) || [''])[0]
const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)[1].match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)
const fills = /<fills\b[^>]*>([\s\S]*?)<\/fills>/.exec(styles)[1].match(/<fill>[\s\S]*?<\/fill>/g)
const styleOf = (ref) => xfs[Number((/\ss="(\d+)"/.exec(cellXml(ref)) || [])[1])]
const fmtCode = (xf) => {
  const id = (/numFmtId="(\d+)"/.exec(xf) || [])[1]
  return ({ 1: '0', 2: '0.00' })[id] || (new RegExp(`numFmtId="${id}" formatCode="([^"]*)"`).exec(styles) || [])[1]
}
const isYellow = (xf) => fills[Number((/fillId="(\d+)"/.exec(xf) || [])[1])]?.includes(UNSURE_FILL)
const textOf = (ref) => (/<t[^>]*>([\s\S]*?)<\/t>/.exec(cellXml(ref)) || [])[1]
const numOf = (ref) => (/<v>([^<]*)<\/v>/.exec(cellXml(ref)) || [])[1]

check('cellXfs count updated', new RegExp(`<cellXfs count="${xfs.length}"`).test(styles))
check('header: customer G4', textOf('G4') === 'Test Marine Co.')
check('header: job AG4', textOf('AG4') === '1234 Z-Block')
check('header: date AW4 as text', textOf('AW4') === 'Jan 5/27' && /t="inlineStr"/.test(cellXml('AW4')))
check('header: tool H5 with label, escaped', textOf('H5') === 'Tool- 1-2&quot; outside &amp; &lt;test&gt;', textOf('H5'))
check('header: unsure serial AM5 blank + yellow', !/<is>/.test(cellXml('AM5')) && isYellow(styleOf('AM5')))
check('headings: O17 L1 .. AX17 L8', textOf('O17') === 'L1' && textOf('AX17') === 'L8')
check('heading keeps its style', /\ss="22"/.test(cellXml('O17')))
check('grid: O19 numeric 1.7500', numOf('O19') === '1.7500' && !/\st="/.test(cellXml('O19')))
check('grid: O19 format 0.0000', fmtCode(styleOf('O19')) === '0.0000')
check('grid: O19 keeps borders of its own style', /borderId="5"/.test(styleOf('O19')))
check('grid: Y20 written as 1.751 with 0.000', numOf('Y20') === '1.751' && fmtCode(styleOf('Y20')) === '0.000')
check('grid: AX38 last cell (exhaust shaft B4) unsure + yellow', !/<v>/.test(cellXml('AX38')) && isYellow(styleOf('AX38')))
check('grid: T20 unsure blank + yellow', !/<v>/.test(cellXml('T20')) && isYellow(styleOf('T20')))
check('grid: AX21 blank on paper left alone', cellXml('AX21') === (new RegExp('<c r="AX21"[^>]*?/>').exec(origSheet) || [])[0])
check('grid: exhaust rows 31-38 filled', numOf('O31') === '1.7500' && numOf('AS38') === '1.7476')
check('grid: AX34 non-number kept as text', textOf('AX34') === '1.75l0')
check('no yellow on filled cells', !isYellow(styleOf('O19')) && !isYellow(styleOf('AG4')))
check('doubtful correction T31: number filled, yellow, 0.0000', numOf('T31') === '1.7510' && isYellow(styleOf('T31')) && fmtCode(styleOf('T31')) === '0.0000')
check('summary lists the correction to check', summary.toCheck.length === 1 && summary.toCheck[0].ref === 'T31')
check('numFmt 0.0000 added', /formatCode="0\.0000"/.test(styles))
check('fullCalcOnLoad set', /fullCalcOnLoad="1"/.test(await after.file('xl/workbook.xml').async('string')))

const comments = await after.file('xl/comments1.xml')?.async('string')
check('comments: one per unsure/noted cell', comments && ['T20', 'AX38', 'AM5', 'O31', 'AX34'].every((r) => comments.includes(`ref="${r}"`)))
check('comments: candidates in text', /Candidate readings: 1\.7500 \/ 1\.7506/.test(comments || ''))
check('vml + legacyDrawing wired', !!after.file('xl/drawings/vmlDrawing1.vml') && /<drawing\b[^>]*\/><legacyDrawing\b/.test(sheet))
const types = await after.file('[Content_Types].xml').async('string')
check('content types: vml + comments', /Extension="vml"/.test(types) && types.includes('/xl/comments1.xml'))

// Cell order within each row must stay ascending or Excel calls the file corrupt.
let ordered = true
for (const r of sheet.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
  const cols = [...r[2].matchAll(/<c r="([A-Z]+\d+)"/g)].map((m) => splitRef(m[1]).col)
  if (cols.some((c, i) => i && c <= cols[i - 1])) ordered = false
}
check('cells stay in column order', ordered)

// Writing into a cell that isn't in the file yet (generic path, future templates).
{
  const extra = await fillXlsx(templateBytes, template.sheet, [{ ref: 'C29', kind: 'text', text: 'new' }, { ref: 'B60', kind: 'number', text: '2.50', decimals: 2 }])
  const x = await (await JSZip.loadAsync(extra.bytes)).file('xl/worksheets/sheet1.xml').async('string')
  check('adds missing cell / row', /<c r="C29"[^>]*t="inlineStr"><is><t[^>]*>new<\/t>/.test(x) && /<row r="60"><c r="B60" s="\d+"><v>2\.50<\/v><\/c><\/row>/.test(x))
}

console.log(`\n${passed} passed, ${failed} failed${outPath ? ` — wrote ${outPath}` : ''}`)
process.exit(failed ? 1 : 0)
