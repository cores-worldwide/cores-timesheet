import JSZip from 'jszip'

// Fills a report .xlsx template with scan readings, in the browser.
//
// The templates are full of merged cells, a logo image and drawings, and
// must come out looking identical — so no SheetJS/ExcelJS round trip (they
// drop images and styles). Instead the .xlsx is opened as a zip and values
// are written straight into the sheet XML. Every other part of the file is
// left exactly as it was.
//
//   - Numbers go in as numeric values, with a number format showing the same
//     decimal places as written (1.7510 -> 0.0000), via a new cell style cloned
//     from the cell's own style. The template file itself is never changed.
//   - Unsure cells are left empty with a light yellow fill (again a cloned
//     style) and an Excel note giving the candidate readings.
//   - Text is written as inline strings, so it doesn't matter whether the
//     template uses a shared-strings table.
//
// Pure (no DOM, no network) so scripts/test-xlsx-fill.mjs can run it in Node.

export const UNSURE_FILL = 'FFF2A8'
const NOTE_AUTHOR = 'Scan to Report'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_PKG_R = 'http://schemas.openxmlformats.org/package/2006/relationships'
const REL_COMMENTS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments'
const REL_VML = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing'

// ── Plan: readings -> cell writes + summary ───────────────────────────────

const NUMBER_RE = /^\d+(\.\d+)?$|^\.\d+$/

function candidatesText(cell) {
  const c = cell.candidates?.length ? `Candidate reading${cell.candidates.length > 1 ? 's' : ''}: ${cell.candidates.join(' / ')}` : 'No candidate reading'
  return cell.note ? `${c}. ${cell.note}` : c
}

// Works out what goes where. `reading` is the scan-report function's reply:
// { header: {key: cell}, column_headings: [cell], grid: {section: {row: [cell]}}, general_notes }
// where cell = { value, unsure, candidates, note }.
export function planCells(template, reading) {
  const writes = []
  const unsure = []
  const noted = []
  const outOfSpec = []
  let filled = 0

  const flagUnsure = (ref, label, cell, keepText) => {
    writes.push({ ref, kind: 'unsure', text: keepText ?? null, comment: `Left blank: not sure of this reading. ${candidatesText(cell)}` })
    unsure.push({ ref, label, candidates: cell.candidates || [], note: cell.note || null })
  }
  const addNote = (ref, label, cell) => {
    if (!cell.note) return null
    noted.push({ ref, label, value: cell.value, note: cell.note })
    return `Note from the scan reading: ${cell.note}`
  }

  for (const [key, def] of Object.entries(template.header)) {
    const cell = reading.header?.[key]
    if (!cell) continue
    const prefix = def.prefix || ''
    if (cell.value !== null && cell.value !== undefined) {
      writes.push({ ref: def.cell, kind: 'text', text: prefix + cell.value, comment: addNote(def.cell, def.label, cell) })
      filled++
    } else if (cell.unsure) {
      // A label sharing the cell (e.g. "Tool- ") stays in place.
      flagUnsure(def.cell, def.label, cell, prefix || null)
    }
  }

  const { row: headRow, columns, defaults } = template.columnHeadings
  const headings = columns.map((col, i) => {
    const cell = reading.column_headings?.[i]
    const ref = `${col}${headRow}`
    if (cell && cell.value !== null && cell.value !== undefined) {
      writes.push({ ref, kind: 'text', text: cell.value, comment: addNote(ref, `Column heading ${i + 1}`, cell) })
      filled++
      return cell.value
    }
    if (cell?.unsure) flagUnsure(ref, `Column heading ${i + 1}`, cell, null)
    return defaults?.[i] || `Column ${i + 1}`
  })

  for (const section of template.sections) {
    const [lo, hi] = section.spec ? section.spec.map(Number) : [null, null]
    for (const [rowName, rowNum] of Object.entries(section.rows)) {
      const cells = reading.grid?.[section.key]?.[rowName] || []
      columns.forEach((col, i) => {
        const cell = cells[i]
        if (!cell) return
        const ref = `${col}${rowNum}`
        const label = `${section.label} ${rowName}, ${headings[i]}`
        if (cell.value === null || cell.value === undefined) {
          if (cell.unsure) flagUnsure(ref, label, cell, null)
          return
        }
        const comment = addNote(ref, label, cell)
        if (NUMBER_RE.test(cell.value)) {
          const decimals = (cell.value.split('.')[1] || '').length
          writes.push({ ref, kind: 'number', text: cell.value, decimals, comment })
          const n = Number(cell.value)
          if (lo !== null && (n < lo || n > hi)) outOfSpec.push({ ref, label, value: cell.value, spec: section.spec })
        } else {
          // Not a plain number (e.g. "1.75l0", "-") — kept as written, as text.
          const why = 'Not a plain number; written as text, exactly as read.'
          writes.push({ ref, kind: 'text', text: cell.value, comment: comment ? `${comment} ${why}` : why })
          noted.push({ ref, label, value: cell.value, note: why })
        }
        filled++
      })
    }
  }

  return { writes, summary: { filled, unsure, noted, outOfSpec, generalNotes: reading.general_notes || [] } }
}

// ── Cell references ───────────────────────────────────────────────────────

export function splitRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!m) throw new Error(`Bad cell reference ${ref}`)
  let col = 0
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { col, row: Number(m[2]) } // both 1-based
}

const xmlEscape = (s) => String(s)
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const cellRe = (ref) => new RegExp(`<c r="${ref}"(?=[\\s>/])[^>]*?(?:/>|>[\\s\\S]*?</c>)`)
const attr = (tag, name) => (new RegExp(`\\s${name}="([^"]*)"`).exec(tag) || [])[1]

// ── Styles: clone a cell's style with a number format and/or yellow fill ──

function styleEditor(stylesXml) {
  let xml = stylesXml
  const xfsMatch = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)
  if (!xfsMatch) throw new Error('Template styles have no cellXfs')
  const xfs = xfsMatch[1].match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) || []
  const newXfs = []
  const fmtIds = new Map() // formatCode -> id
  const newFmts = []
  let nextFmtId = 164
  for (const m of xml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    fmtIds.set(m[2], Number(m[1]))
    nextFmtId = Math.max(nextFmtId, Number(m[1]) + 1)
  }
  let fillId = null
  const cache = new Map()

  const setAttr = (tag, name, value) => (new RegExp(`\\s${name}="`).test(tag)
    ? tag.replace(new RegExp(`\\s${name}="[^"]*"`), ` ${name}="${value}"`)
    : tag.replace(/^<xf\b/, `<xf ${name}="${value}"`))

  function numFmtFor(decimals) {
    if (!decimals) return 1 // built-in "0"
    if (decimals === 2) return 2 // built-in "0.00"
    const code = '0.' + '0'.repeat(decimals)
    if (!fmtIds.has(code)) {
      fmtIds.set(code, nextFmtId)
      newFmts.push(`<numFmt numFmtId="${nextFmtId}" formatCode="${code}"/>`)
      nextFmtId++
    }
    return fmtIds.get(code)
  }

  function yellowFill() {
    if (fillId === null) {
      const m = /<fills\b[^>]*count="(\d+)"[^>]*>/.exec(xml)
      if (!m) throw new Error('Template styles have no fills')
      fillId = Number(m[1])
      xml = xml.replace(/<fills\b[^>]*count="\d+"([^>]*)>([\s\S]*?)<\/fills>/, (_, rest, inner) =>
        `<fills count="${fillId + 1}"${rest}>${inner}<fill><patternFill patternType="solid"><fgColor rgb="FF${UNSURE_FILL}"/><bgColor indexed="64"/></patternFill></fill></fills>`)
    }
    return fillId
  }

  // Returns the style index to use for a cell whose current style is `base`.
  function derive(base, { decimals = null, yellow = false }) {
    const key = `${base}|${decimals}|${yellow}`
    if (cache.has(key)) return cache.get(key)
    let tag = xfs[base] || xfs[0]
    // Only the opening tag carries the attributes we change.
    const open = /^<xf\b[^>]*?(?=\/?>)/.exec(tag)[0]
    let newOpen = open
    if (decimals !== null) newOpen = setAttr(setAttr(newOpen, 'numFmtId', numFmtFor(decimals)), 'applyNumberFormat', '1')
    if (yellow) newOpen = setAttr(setAttr(newOpen, 'fillId', yellowFill()), 'applyFill', '1')
    tag = newOpen + tag.slice(open.length)
    const index = xfs.length + newXfs.length
    newXfs.push(tag)
    cache.set(key, index)
    return index
  }

  function finish() {
    if (newXfs.length) {
      xml = xml.replace(/<cellXfs\b([^>]*)>([\s\S]*?)<\/cellXfs>/, (_, attrs, inner) =>
        `<cellXfs${attrs.replace(/\scount="\d+"/, '')} count="${xfs.length + newXfs.length}">${inner}${newXfs.join('')}</cellXfs>`)
    }
    if (newFmts.length) {
      if (/<numFmts\b[^>]*\/>/.test(xml)) {
        xml = xml.replace(/<numFmts\b[^>]*\/>/, `<numFmts count="${newFmts.length}">${newFmts.join('')}</numFmts>`)
      } else if (/<numFmts\b/.test(xml)) {
        xml = xml.replace(/<numFmts\b[^>]*>([\s\S]*?)<\/numFmts>/, (_, inner) => {
          const all = inner + newFmts.join('')
          return `<numFmts count="${(all.match(/<numFmt\b/g) || []).length}">${all}</numFmts>`
        })
      } else {
        xml = xml.replace(/(<styleSheet\b[^>]*>)/, `$1<numFmts count="${newFmts.length}">${newFmts.join('')}</numFmts>`)
      }
    }
    return xml
  }

  return { derive, finish }
}

// ── Sheet XML: write one cell ─────────────────────────────────────────────

function putCell(sheetXml, ref, makeCell) {
  const re = cellRe(ref)
  const existing = re.exec(sheetXml)
  if (existing) {
    const openTag = /^<c\b[^>]*/.exec(existing[0])[0]
    const s = Number(attr(openTag, 's') || 0)
    return sheetXml.replace(re, () => makeCell(s))
  }
  // Cell not in the file yet: add it to its row, in column order.
  const { col, row } = splitRef(ref)
  const newCell = makeCell(0)
  const rowRe = new RegExp(`<row r="${row}"(?=[\\s>/])([^>]*?)(/>|>([\\s\\S]*?)</row>)`)
  const rowMatch = rowRe.exec(sheetXml)
  if (rowMatch) {
    if (rowMatch[2] === '/>') return sheetXml.replace(rowRe, `<row r="${row}"${rowMatch[1]}>${newCell}</row>`)
    const inner = rowMatch[3]
    const cells = [...inner.matchAll(/<c r="([A-Z]+)\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)]
    const after = cells.find((m) => splitRef(`${m[1]}${row}`).col > col)
    const newInner = after ? inner.slice(0, after.index) + newCell + inner.slice(after.index) : inner + newCell
    return sheetXml.replace(rowRe, `<row r="${row}"${rowMatch[1]}>${newInner}</row>`)
  }
  // Row not in the file yet: add it in row order.
  const rows = [...sheetXml.matchAll(/<row r="(\d+)"/g)]
  const nextRow = rows.find((m) => Number(m[1]) > row)
  const rowXml = `<row r="${row}">${newCell}</row>`
  if (nextRow) return sheetXml.slice(0, nextRow.index) + rowXml + sheetXml.slice(nextRow.index)
  if (/<sheetData\s*\/>/.test(sheetXml)) return sheetXml.replace(/<sheetData\s*\/>/, `<sheetData>${rowXml}</sheetData>`)
  return sheetXml.replace('</sheetData>', `${rowXml}</sheetData>`)
}

const textCell = (ref, s, text) => (text === null || text === ''
  ? `<c r="${ref}" s="${s}"/>`
  : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`)

// ── Notes (Excel comments) ────────────────────────────────────────────────

function nextFreeName(zip, make) {
  for (let n = 1; ; n++) if (!zip.file(make(n))) return make(n)
}

function vmlShape(ref, id) {
  const { col, row } = splitRef(ref)
  // Anchor: left col, dx, top row, dy, right col, dx, bottom row, dy (0-based).
  // The template's columns are very narrow, so the note box spans 14 of them.
  const anchor = `${col}, 15, ${Math.max(row - 2, 0)}, 2, ${col + 14}, 15, ${row + 3}, 4`
  return `<v:shape id="_x0000_s${id}" type="#_x0000_t202" style="position:absolute;margin-left:80pt;margin-top:1.5pt;width:150pt;height:70pt;z-index:${id - 1024};visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto">`
    + '<v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/>'
    + '<v:textbox style="mso-direction-alt:auto"><div style="text-align:left"></div></v:textbox>'
    + `<x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:Anchor>${anchor}</x:Anchor><x:AutoFill>False</x:AutoFill>`
    + `<x:Row>${row - 1}</x:Row><x:Column>${col - 1}</x:Column></x:ClientData></v:shape>`
}

async function addNotes(zip, sheetPath, sheetXml, notes) {
  const relsPath = sheetPath.replace(/([^/]+)$/, '_rels/$1.rels')
  let rels = (await zip.file(relsPath)?.async('string')) || `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${NS_PKG_R}"></Relationships>`
  // A template that already has notes on this sheet: don't touch them. The
  // on-screen summary still lists everything.
  if (rels.includes(REL_COMMENTS) || /<legacyDrawing\b/.test(sheetXml)) return { sheetXml, added: false }

  const commentsPath = nextFreeName(zip, (n) => `xl/comments${n}.xml`)
  const vmlPath = nextFreeName(zip, (n) => `xl/drawings/vmlDrawing${n}.vml`)
  const ids = [...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]))
  const next = Math.max(0, ...ids) + 1
  const vmlRid = `rId${next}`
  rels = rels.replace('</Relationships>',
    `<Relationship Id="rId${next + 1}" Type="${REL_COMMENTS}" Target="/${commentsPath}"/>`
    + `<Relationship Id="${vmlRid}" Type="${REL_VML}" Target="/${vmlPath}"/></Relationships>`)

  const comments = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author>${NOTE_AUTHOR}</author></authors><commentList>`
    + notes.map(({ ref, text }) => `<comment ref="${ref}" authorId="0"><text><r><t xml:space="preserve">${xmlEscape(text)}</t></r></text></comment>`).join('')
    + '</commentList></comments>'
  const vml = '<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">'
    + '<o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout>'
    + '<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>'
    + notes.map(({ ref }, i) => vmlShape(ref, 1025 + i)).join('')
    + '</xml>'

  // legacyDrawing goes right after <drawing> in the sheet's element order.
  const legacy = `<legacyDrawing xmlns:r="${NS_R}" r:id="${vmlRid}"/>`
  const drawing = /<drawing\b[^>]*\/>/.exec(sheetXml)
  if (drawing) {
    sheetXml = sheetXml.replace(drawing[0], drawing[0] + legacy)
  } else {
    const before = /<(legacyDrawingHF|drawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/.exec(sheetXml)
    sheetXml = before ? sheetXml.slice(0, before.index) + legacy + sheetXml.slice(before.index) : sheetXml.replace('</worksheet>', `${legacy}</worksheet>`)
  }

  let types = await zip.file('[Content_Types].xml').async('string')
  if (!/Extension="vml"/i.test(types)) types = types.replace('</Types>', '<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/></Types>')
  types = types.replace('</Types>', `<Override PartName="/${commentsPath}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/></Types>`)

  zip.file(relsPath, rels)
  zip.file(commentsPath, comments)
  zip.file(vmlPath, vml)
  zip.file('[Content_Types].xml', types)
  return { sheetXml, added: true }
}

// ── Fill ──────────────────────────────────────────────────────────────────

// templateBytes: the blank .xlsx (ArrayBuffer/Uint8Array). Returns the filled
// file as a Uint8Array plus whether Excel notes were added.
export async function fillXlsx(templateBytes, sheetPath, writes) {
  const zip = await JSZip.loadAsync(templateBytes)
  let sheet = await zip.file(sheetPath)?.async('string')
  if (!sheet) throw new Error(`Template has no ${sheetPath}`)
  const styles = styleEditor(await zip.file('xl/styles.xml').async('string'))

  for (const w of writes) {
    sheet = putCell(sheet, w.ref, (s) => {
      if (w.kind === 'number') return `<c r="${w.ref}" s="${styles.derive(s, { decimals: w.decimals })}"><v>${w.text}</v></c>`
      if (w.kind === 'unsure') return textCell(w.ref, styles.derive(s, { yellow: true }), w.text)
      return textCell(w.ref, s, w.text)
    })
  }

  const notes = writes.filter((w) => w.comment).map((w) => ({ ref: w.ref, text: w.comment }))
  let notesAdded = false
  if (notes.length) ({ sheetXml: sheet, added: notesAdded } = await addNotes(zip, sheetPath, sheet, notes))

  zip.file(sheetPath, sheet)
  zip.file('xl/styles.xml', styles.finish())

  // Have Excel recalculate on open so no stale cached results show.
  let wb = await zip.file('xl/workbook.xml').async('string')
  if (/<calcPr\b/.test(wb)) {
    if (!/fullCalcOnLoad=/.test(wb)) wb = wb.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"')
  } else {
    wb = wb.replace(/(<\/sheets>(?:\s*<definedNames\b[\s\S]*?(?:<\/definedNames>|\/>))?)/, '$1<calcPr fullCalcOnLoad="1"/>')
  }
  zip.file('xl/workbook.xml', wb)

  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  return { bytes, notesAdded }
}
