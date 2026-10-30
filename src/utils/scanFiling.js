import JSZip from 'jszip'
import { supabase } from '../supabaseClient'
import { getAdminName } from '../components/PasswordGate'
import { splitRef, matchJob } from './xlsxFill'

export { matchJob }

// Job Files (Jim, 2026-10-30): the office's files for a job, in
// Cores.job_files + the private job-files bucket, shown on the job's page in
// Job Reports. Finished measurement reports are filed here from Scan to Report
// with their original scan; anything else (e.g. the external report Niki
// writes) is uploaded straight onto the job.

const BUCKET = 'job-files'
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Reads one cell's text from a saved workbook. Excel rewrites the file when
// she saves, so the value may be a shared string, inline string or number.
export async function readCellText(bytes, sheetPath, ref) {
  const zip = await JSZip.loadAsync(bytes)
  const sheet = await zip.file(sheetPath)?.async('string')
  if (!sheet) return ''
  splitRef(ref)
  const cell = new RegExp(`<c r="${ref}"(?=[\\s>/])([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`).exec(sheet)
  if (!cell || !cell[2]) return ''
  const type = (/\st="([^"]*)"/.exec(cell[1]) || [])[1]
  const texts = (xml) => [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('')
  const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  if (type === 'inlineStr') return unescape(texts(cell[2])).trim()
  const v = (/<v>([\s\S]*?)<\/v>/.exec(cell[2]) || [])[1] ?? ''
  if (type === 's') {
    const shared = await zip.file('xl/sharedStrings.xml')?.async('string')
    const items = shared ? [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => m[1]) : []
    return unescape(texts(items[Number(v)] || '')).trim()
  }
  return unescape(v).trim()
}

const safeName = (name) => name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80)

// Uploads one file to the job's folder and records it. Returns the new row.
async function addJobFile(job, file, { kind, contentType, templateId = null, sourceId = null }) {
  const type = contentType || file.type || 'application/octet-stream'
  const path = `${job.id}/${new Date().toISOString().replace(/[:.]/g, '-')}-${kind}-${safeName(file.name)}`
  // Re-wrapped with the type set: browsers sometimes leave a file's type empty.
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, new Blob([file], { type }), { contentType: type, upsert: false })
  if (upErr) throw new Error(`Couldn't upload ${file.name}: ${upErr.message}`)
  const { data, error } = await supabase.schema('Cores').from('job_files').insert({
    job_id: job.id,
    kind,
    file_name: file.name,
    storage_path: path,
    content_type: type,
    size_bytes: file.size,
    template_id: templateId,
    source_id: sourceId,
    filed_by_name: getAdminName() || null,
  }).select('id').single()
  if (error) throw new Error(`Couldn't record ${file.name}: ${error.message}`)
  return data
}

// A finished measurement report, with the scan it was read from.
export async function fileReport({ job, templateId, reportFile, scanFile }) {
  if (!job) throw new Error('Pick the job first.')
  if (!reportFile) throw new Error('Choose the finished Excel report.')
  const report = await addJobFile(job, reportFile, { kind: 'report', contentType: XLSX_TYPE, templateId })
  if (scanFile) await addJobFile(job, scanFile, { kind: 'scan', contentType: scanFile.type || 'application/pdf', sourceId: report.id })
}

// Any other files for the job (e.g. the external report written from the measurements).
export async function uploadJobFiles(job, files) {
  for (const f of files) await addJobFile(job, f, { kind: 'file' })
}

export async function listJobFiles(jobId) {
  const { data, error } = await supabase.schema('Cores').from('job_files')
    .select('*').eq('job_id', jobId).order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// The bucket is private: files open through a link that works for an hour.
export async function openStoredFile(path, downloadName) {
  const { data, error } = await supabase.storage.from(BUCKET)
    .createSignedUrl(path, 3600, downloadName ? { download: downloadName } : undefined)
  if (error) throw new Error(`Couldn't open the file: ${error.message}`)
  return data.signedUrl
}
