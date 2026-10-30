import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { READ_TEMPLATES } from "./templates.js"
import { mergeReads } from "./agreement.js"

// Scan to Report (office tab): reads a scanned handwritten inspection sheet
// and returns its values for the app to drop into the matching .xlsx template.
//
// Jim's rule: IF YOU DON'T KNOW, DON'T GUESS. The scan is read twice by two
// separate Claude calls and a cell keeps a value only when both reads agree
// exactly (see agreement.js); everything else comes back empty and flagged.
//
// Keeps nothing: no tables, no storage. The scan goes to Claude and the
// readings come back to the browser, which builds the .xlsx itself.
//
// Called with the anon key like the other functions (verify_jwt left on).
// The office login is a client-side shared password, so anyone holding the
// anon key can call this and spend Claude credits — only the cheap guards
// below for now; rate limiting is an open question for Jim.

// Accuracy matters most here, so the most capable Opus. One place to change it.
const MODEL = 'claude-opus-5-5'
const EFFORT = 'high'
const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_PDF_PAGES = 5
const MEDIA_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonReply(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } })
}

// Rough page count: counts page objects in the raw PDF. Scanner PDFs list them
// plainly; a PDF that hides them in compressed object streams counts as 0 and
// is let through (the Claude API has its own page limit).
function countPdfPages(bytes: Uint8Array): number {
  const text = new TextDecoder('latin1').decode(bytes)
  return (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ── What each read returns (structured output schema) ─────────────────────
// Plain strings, "" for blank: the API caps union-typed (nullable) fields at
// 16 per schema and the grid alone has far more cells than that.
const plainString = { type: 'string' }
const CELL = {
  type: 'object',
  properties: {
    value: { ...plainString, description: 'The value exactly as written, or "" if blank or not certain.' },
    unsure_reading: { ...plainString, description: 'When value is "" because you are not certain: your best candidate reading. Otherwise "".' },
    note: { ...plainString, description: 'Anything worth flagging about this cell (ink blob, overwrite, correction). Otherwise "".' },
    correction: { type: 'string', enum: ['none', 'neat', 'doubtful'], description: 'Whether the value is a correction (rewritten in another ink, or over whiteout): "neat" if every digit of the correction is clear, "doubtful" if there is any doubt about it, otherwise "none".' },
  },
  required: ['value', 'unsure_reading', 'note', 'correction'],
  additionalProperties: false,
}

function buildSchema(spec: any) {
  const header: any = { type: 'object', properties: {}, required: [], additionalProperties: false }
  for (const [key, help] of Object.entries(spec.header)) {
    header.properties[key] = { ...CELL, description: help }
    header.required.push(key)
  }
  const grid: any = { type: 'object', properties: {}, required: [], additionalProperties: false }
  for (const section of spec.sections) {
    const rows: any = { type: 'object', properties: {}, required: [], additionalProperties: false, description: section.label }
    for (const row of section.rows) {
      rows.properties[row] = { type: 'array', items: CELL, description: `${section.label} row ${row}: exactly ${spec.columns} cells, left to right.` }
      rows.required.push(row)
    }
    grid.properties[section.key] = rows
    grid.required.push(section.key)
  }
  return {
    type: 'object',
    properties: {
      header,
      column_headings: { type: 'array', items: CELL, description: spec.columnHeadingsHelp },
      grid,
      general_notes: { type: 'array', items: { type: 'string' }, description: 'Anything about the sheet as a whole worth telling the office. Empty if nothing.' },
    },
    required: ['header', 'column_headings', 'grid', 'general_notes'],
    additionalProperties: false,
  }
}

function buildPrompt(spec: any): string {
  const sections = spec.sections.map((s: any) => `- ${s.label} (grid key "${s.key}"): rows ${s.rows.join(', ')}`).join('\n')
  return `This is a scan of a handwritten "${spec.title}" sheet filled in by a technician. Read it and report the values using the JSON schema.

The measurement grid has ${spec.columns} columns. Sections and rows:
${sections}

Rules — accuracy matters more than completeness. IF YOU DON'T KNOW, DON'T GUESS:
1. Keep every value exactly as written: same digits, same decimal places, keep trailing zeros (if "2.3450" is written, return "2.3450", not "2.345"). Never round, convert or tidy a value.
2. If you are not certain of every character of a value, set value to "", put your best candidate in unsure_reading, and say why in note.
3. If any ink blob, scribble or overwrite in the same ink touches any digit of a value, set value to "", put the candidate in unsure_reading, and describe it in note — even if you think you can tell what it says.
4. A correction (the value rewritten in a different ink, e.g. blue over black, or rewritten over whiteout) is the technician's final value. Put the corrected reading in value and leave unsure_reading "". Set correction to "neat" if every digit of the correction is clear, or to "doubtful" if there is any doubt at all about it (ink spill, smudge, an unclear digit, the old digits showing through enough to confuse) and say why in note. Every other cell: correction "none".
5. A box with nothing written in it: value, unsure_reading and note all "", correction "none".
6. Each row must have exactly ${spec.columns} cells, left to right, matching the column headings. Never shift values between columns to fill a gap.
7. Only report the fields in the schema. Ignore anything else written on the sheet (e.g. the technician's name).
8. If the document contains more than one inspection sheet, read only the first one and say so in general_notes.`
}

async function readOnce(spec: any, mediaType: string, data: string) {
  const source = { type: 'base64', media_type: mediaType, data }
  const fileBlock = mediaType === 'application/pdf' ? { type: 'document', source } : { type: 'image', source }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      // On a safety-classifier refusal, retry on Anthropic's recommended model.
      'anthropic-beta': 'server-side-fallback-2026-07-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      fallbacks: 'default',
      // The schema goes in the prompt, not output_config.format: a full grid of
      // cell objects compiles to a grammar larger than the API accepts.
      output_config: { effort: EFFORT },
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: buildPrompt(spec) + '\n\nReply with ONLY a JSON object (no prose, no code fence) matching this JSON schema:\n' + JSON.stringify(buildSchema(spec)) }] }],
    }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`Claude read failed (${res.status}): ${JSON.stringify(body?.error || body).slice(0, 300)}`)
  if (body.stop_reason === 'refusal') throw new Error('Claude declined to read this scan')
  if (body.stop_reason === 'max_tokens') throw new Error('Claude ran out of room reading this scan')
  const text = (body.content || []).find((c: any) => c.type === 'text')?.text
  if (!text) throw new Error('Claude returned no reading')
  const start = text.indexOf('{'), end = text.lastIndexOf('}')
  let reading
  try {
    reading = JSON.parse(text.slice(start, end + 1))
  } catch {
    console.error('scan-report: unparseable reply', body.stop_reason, text.length, text.slice(0, 300), '…', text.slice(-300))
    throw new Error('Claude returned a reading that is not valid JSON')
  }
  return { reading, usage: body.usage || {} }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return jsonReply({ ok: false, error: 'POST only' }, 405)

  // Base64 is 4/3 the size of the file, plus a little JSON around it.
  const declared = Number(req.headers.get('content-length') || 0)
  if (declared > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 4096) return jsonReply({ ok: false, error: 'File is too large (10 MB max)' }, 413)

  let json: any
  try {
    json = await req.json()
  } catch {
    return jsonReply({ ok: false, error: 'Invalid JSON body' }, 400)
  }

  const templateId = String(json?.template_id || '')
  const spec = Object.hasOwn(READ_TEMPLATES, templateId) ? (READ_TEMPLATES as any)[templateId] : null
  if (!spec) return jsonReply({ ok: false, error: 'Unknown report template' }, 400)

  const mediaType = String(json?.media_type || '')
  if (!MEDIA_TYPES.includes(mediaType)) return jsonReply({ ok: false, error: 'Send a PDF or a JPEG/PNG/WebP/GIF image' }, 400)

  const data = typeof json?.data === 'string' ? json.data.replace(/\s/g, '') : ''
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return jsonReply({ ok: false, error: 'No file data' }, 400)
  let bytes: Uint8Array
  try {
    bytes = base64ToBytes(data)
  } catch {
    return jsonReply({ ok: false, error: 'File data is not valid base64' }, 400)
  }
  if (bytes.length > MAX_FILE_BYTES) return jsonReply({ ok: false, error: 'File is too large (10 MB max)' }, 413)
  if (mediaType === 'application/pdf') {
    if (new TextDecoder('latin1').decode(bytes.subarray(0, 5)) !== '%PDF-') return jsonReply({ ok: false, error: 'That file is not a PDF' }, 400)
    const pages = countPdfPages(bytes)
    if (pages > MAX_PDF_PAGES) return jsonReply({ ok: false, error: `PDF has ${pages} pages (${MAX_PDF_PAGES} max). Scan one sheet at a time.` }, 400)
  }

  try {
    // Two independent reads, run side by side to keep the wait down.
    const [a, b] = await Promise.all([readOnce(spec, mediaType, data), readOnce(spec, mediaType, data)])
    const merged = mergeReads(a.reading, b.reading, spec)
    const usage = {
      input_tokens: (a.usage.input_tokens || 0) + (b.usage.input_tokens || 0),
      output_tokens: (a.usage.output_tokens || 0) + (b.usage.output_tokens || 0),
    }
    return jsonReply({ ok: true, template_id: templateId, model: MODEL, ...merged, usage })
  } catch (e) {
    console.error('scan-report:', e)
    return jsonReply({ ok: false, error: (e as Error).message }, 502)
  }
})
