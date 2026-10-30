import { useSyncExternalStore } from 'react'
import { findTemplate, reportFilename } from './reportTemplates'
import { planCells, fillXlsx } from './xlsxFill'
import { scanToViews } from './scanViews'

// Scans run here, outside any page, so the office can start one and carry on
// elsewhere in the app (Jim, 2026-10-30). Each finished report downloads by
// itself; the top bar shows what's running. Lives only in this browser tab:
// nothing is stored, so closing or reloading the tab drops running scans
// (the browser asks first).

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-report`
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// job: { id, fileName, templateLabel, status: 'reading'|'done'|'failed',
//        startedAt, finishedAt, error, result: { bytes, name, usedToday, summary, notesAdded } }
let jobs = []
const listeners = new Set()
let nextId = 1

function update(id, changes) {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...changes } : j))
  listeners.forEach((l) => l())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useScanJobs() {
  return useSyncExternalStore(subscribe, () => jobs)
}

export function downloadBytes(bytes, name) {
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export function dismissJob(id) {
  jobs = jobs.filter((j) => j.id !== id)
  listeners.forEach((l) => l())
}

// Warn before the tab is closed or reloaded while a scan is still reading.
window.addEventListener('beforeunload', (e) => {
  if (jobs.some((j) => j.status === 'reading')) {
    e.preventDefault()
    e.returnValue = ''
  }
})

export function startScan(file, templateId) {
  const template = findTemplate(templateId)
  if (!template) throw new Error('Unknown report template')
  const id = nextId++
  jobs = [{ id, fileName: file.name, templateLabel: template.label, status: 'reading', startedAt: Date.now() }, ...jobs]
  listeners.forEach((l) => l())

  ;(async () => {
    try {
      // The page image and zoomed crops are made here in the browser; only
      // those images are sent, not the original file.
      const views = await scanToViews(file, template.zoom)
      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ template_id: template.id, ...views }),
      })
      const reading = await res.json().catch(() => null)
      if (!res.ok || !reading?.ok) throw new Error(reading?.error || `Reading the scan failed (${res.status})`)

      const tplRes = await fetch(`${import.meta.env.BASE_URL}${template.file}`)
      if (!tplRes.ok) throw new Error('Could not load the report template')
      const { writes, summary } = planCells(template, reading)
      const { bytes, notesAdded } = await fillXlsx(await tplRes.arrayBuffer(), template.sheet, writes)
      const { name, usedToday } = reportFilename(template, reading.header)
      downloadBytes(bytes, name)
      update(id, { status: 'done', finishedAt: Date.now(), result: { bytes, name, usedToday, summary, notesAdded } })
    } catch (e) {
      update(id, { status: 'failed', finishedAt: Date.now(), error: e.message || String(e) })
    }
  })()
  return id
}
