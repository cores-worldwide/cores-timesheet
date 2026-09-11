import { jsPDF } from 'jspdf'
import { fmtHours } from './format'

// First-draft reconciliation report against Sage 50's own Time Slips Journal
// (see the reference screenshot Jim sent 2026-09-11) — Reg Hours maps to
// Sage item Z200, OT to Z202, Per Diem to Z205; Shop work is also Z200 but
// billed Non Billable there, so it gets its own column here rather than
// blending into Reg. Only entries for a (employee, work_date) already
// stamped "Posted to Sage" (daily_summary_posted) belong in this report —
// anything not posted yet hasn't reached Sage to reconcile against.
//
// One row per job entry (not per employee/day) so Job # — the whole reason
// jobnum_pref exists — can sit on the left and be checked line-by-line
// against Sage's own per-job time slips. "Give it a shot, we'll play with
// it later" — Jim, 2026-09-11: expect this shape to change.
const fmtHrs = (n) => (n ? fmtHours(n) : '')
const fmtDate = (ymd) => {
  const d = new Date(ymd + 'T12:00:00')
  const mon = d.toLocaleDateString('en-US', { month: 'short' })
  return `${String(d.getDate()).padStart(2, '0')}-${mon}-${d.getFullYear()}`
}

// rows: [{ jobLabel, employeeName, date, reg, ot, pd, shop }]
export function generateSageSyncPDF({ dateFrom, dateTo, rows }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 40
  const contentW = pageW - margin * 2
  let y = margin

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
  doc.text('Sage Sync Report', margin, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text('Posted entries only', pageW - margin, y - 12, { align: 'right' })
  doc.setFontSize(11)
  doc.text(`${fmtDate(dateFrom)}  –  ${fmtDate(dateTo)}`, pageW - margin, y + 4, { align: 'right' })
  y += 26
  doc.setDrawColor(0); doc.setLineWidth(1)
  doc.line(margin, y, pageW - margin, y)
  y += 20

  const colW = {
    job: contentW * 0.20,
    emp: contentW * 0.26,
    date: contentW * 0.16,
    reg: contentW * 0.095,
    ot: contentW * 0.095,
    pd: contentW * 0.095,
    shop: contentW * 0.095,
  }
  const colX = {}
  let cx = margin
  Object.entries(colW).forEach(([k, w]) => { colX[k] = cx; cx += w })
  const tableRight = margin + contentW
  const rowH = 18

  function drawHeader() {
    doc.setFillColor(240, 240, 240)
    doc.rect(margin, y, contentW, rowH, 'F')
    doc.setDrawColor(0); doc.setLineWidth(1)
    doc.rect(margin, y, contentW, rowH)
    doc.setLineWidth(0.5)
    Object.values(colX).slice(1).forEach(x => doc.line(x, y, x, y + rowH))
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    doc.text('JOB #', colX.job + 5, y + rowH / 2 + 3)
    doc.text('EMPLOYEE', colX.emp + 5, y + rowH / 2 + 3)
    doc.text('DATE', colX.date + 5, y + rowH / 2 + 3)
    doc.text('REG', colX.reg + 5, y + rowH / 2 + 3)
    doc.text('OT', colX.ot + 5, y + rowH / 2 + 3)
    doc.text('PD', colX.pd + 5, y + rowH / 2 + 3)
    doc.text('SHOP', colX.shop + 5, y + rowH / 2 + 3)
    y += rowH
  }

  // Starts a new page (with the header re-drawn) when the next row wouldn't
  // fit, so a long date range paginates instead of running off the page.
  function ensureSpace() {
    if (y + rowH > pageH - margin - 40) {
      doc.addPage()
      y = margin
      drawHeader()
    }
  }

  drawHeader()

  let totalReg = 0, totalOT = 0, totalPD = 0, totalShop = 0
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  rows.forEach((r, i) => {
    ensureSpace()
    if (i % 2 === 1) {
      doc.setFillColor(248, 248, 248)
      doc.rect(margin, y, contentW, rowH, 'F')
    }
    totalReg += Number(r.reg || 0)
    totalOT += Number(r.ot || 0)
    totalPD += Number(r.pd || 0)
    totalShop += Number(r.shop || 0)
    doc.text(String(r.jobLabel || ''), colX.job + 5, y + rowH / 2 + 3)
    doc.text(String(r.employeeName || ''), colX.emp + 5, y + rowH / 2 + 3)
    doc.text(fmtDate(r.date), colX.date + 5, y + rowH / 2 + 3)
    doc.text(fmtHrs(r.reg), colX.reg + 5, y + rowH / 2 + 3)
    doc.text(fmtHrs(r.ot), colX.ot + 5, y + rowH / 2 + 3)
    doc.text(r.pd ? String(r.pd) : '', colX.pd + 5, y + rowH / 2 + 3)
    doc.text(fmtHrs(r.shop), colX.shop + 5, y + rowH / 2 + 3)
    y += rowH
    doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.5)
    doc.line(margin, y, tableRight, y)
  })

  ensureSpace()
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.setFillColor(240, 240, 240)
  doc.rect(margin, y, contentW, rowH, 'F')
  doc.setDrawColor(0); doc.setLineWidth(1)
  doc.rect(margin, y, contentW, rowH)
  doc.text('TOTAL', colX.job + 5, y + rowH / 2 + 3)
  doc.text(fmtHrs(totalReg), colX.reg + 5, y + rowH / 2 + 3)
  doc.text(fmtHrs(totalOT), colX.ot + 5, y + rowH / 2 + 3)
  doc.text(totalPD ? String(totalPD) : '', colX.pd + 5, y + rowH / 2 + 3)
  doc.text(fmtHrs(totalShop), colX.shop + 5, y + rowH / 2 + 3)
  y += rowH + 20

  doc.setFont('helvetica', 'italic'); doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  doc.text('Shop hours are non-billable (Z200, Non Billable) — not included in Reg.', margin, y)
  doc.setTextColor(0, 0, 0)

  doc.save(`sage-sync_${dateFrom}_to_${dateTo}.pdf`)
}
