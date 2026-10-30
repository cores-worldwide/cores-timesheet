import JSZip from 'jszip'
import { supabase } from '../supabaseClient'
import { getAdminName } from '../components/PasswordGate'
import { splitRef, matchJob } from './xlsxFill'

export { matchJob }

// Filing finished reports (Jim, 2026-10-30): after Niki fills in the blanks in
// Excel she drops the finished .xlsx back in, confirms the job, and it's
// stored on that job with the original scan (Cores.scan_reports + the private
// scan-reports bucket). Shown on the job's Job Reports page.

const BUCKET = 'scan-reports'
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

export async function fileReport({ job, templateId, reportFile, scanFile }) {
  if (!job) throw new Error('Pick the job first.')
  if (!reportFile) throw new Error('Choose the finished Excel report.')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const base = `${job.id}/${stamp}`
  const put = async (file, path, contentType) => {
    // Re-wrapped with the type set: browsers sometimes leave a file's type
    // empty, and the bucket only takes .xlsx / PDF / image types.
    const body = new Blob([file], { type: contentType })
    const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType, upsert: false })
    if (error) throw new Error(`Couldn't upload ${file.name}: ${error.message}`)
    return path
  }
  const reportPath = await put(reportFile, `${base}-${safeName(reportFile.name)}`, XLSX_TYPE)
  const scanPath = scanFile ? await put(scanFile, `${base}-scan-${safeName(scanFile.name)}`, scanFile.type || 'application/pdf') : null
  const { error } = await supabase.schema('Cores').from('scan_reports').insert({
    job_id: job.id,
    template_id: templateId,
    report_path: reportPath,
    report_name: reportFile.name,
    scan_path: scanPath,
    scan_name: scanFile?.name || null,
    filed_by_name: getAdminName() || null,
  })
  if (error) throw new Error(`Couldn't file the report: ${error.message}`)
}

export async function listJobReports(jobId) {
  const { data, error } = await supabase.schema('Cores').from('scan_reports')
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
