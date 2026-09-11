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
//
// Styled to match the on-screen preview table in AdminDashboard.jsx's Sage
// Report tab (plain rows, thin light-grey dividers, grey uppercase header,
// no cell shading/grid) rather than the boxed/shaded look this started
// with — Jim: "try to make it look like the data on the screen", 2026-09-11.
const fmtHrs = (n) => (n ? fmtHours(n) : '')
// Same shape as the web table's fmtPayDate (day + short month, no year) —
// the report is always scoped to one narrow range, so the year is implied.
const fmtDate = (ymd) => {
  const d = new Date(ymd + 'T12:00:00')
  const mon = d.toLocaleDateString('en-US', { month: 'short' })
  return `${d.getDate()} ${mon}`
}
const fmtHeaderDate = (ymd) => {
  const d = new Date(ymd + 'T12:00:00')
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
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
  doc.setTextColor(20, 20, 20)
  doc.text('Sage Sync Report', margin, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.setTextColor(136, 136, 136)
  doc.text('Posted entries only', pageW - margin, y - 12, { align: 'right' })
  doc.setFontSize(11)
  doc.setTextColor(20, 20, 20)
  doc.text(`${fmtHeaderDate(dateFrom)}  –  ${fmtHeaderDate(dateTo)}`, pageW - margin, y + 4, { align: 'right' })
  y += 30

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
  const rowH = 20
  const headers = [['job', 'JOB #'], ['emp', 'EMPLOYEE'], ['date', 'DATE'], ['reg', 'REG'], ['ot', 'OT'], ['pd', 'PD'], ['shop', 'SHOP']]

  function drawHeaderRow() {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
    doc.setTextColor(136, 136, 136)
    headers.forEach(([key, label]) => doc.text(label, colX[key] + 4, y + rowH - 7))
    y += rowH
    doc.setDrawColor(221, 221, 221); doc.setLineWidth(1.2)
    doc.line(margin, y, tableRight, y)
  }

  // Starts a new page (with the header re-drawn) when the next row wouldn't
  // fit, so a long date range paginates instead of running off the page.
  function ensureSpace() {
    if (y + rowH > pageH - margin - 40) {
      doc.addPage()
      y = margin
      drawHeaderRow()
    }
  }

  drawHeaderRow()

  let totalReg = 0, totalOT = 0, totalPD = 0, totalShop = 0
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.setTextColor(20, 20, 20)
  rows.forEach(r => {
    ensureSpace()
    // ensureSpace may have just redrawn the page header, which leaves the
    // pen on its own grey — reset before every row rather than relying on
    // the previous row's last color, or the first row of every page after
    // page 1 renders JOB #/EMPLOYEE in the header's grey instead of black.
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    doc.setTextColor(20, 20, 20)
    totalReg += Number(r.reg || 0)
    totalOT += Number(r.ot || 0)
    totalPD += Number(r.pd || 0)
    totalShop += Number(r.shop || 0)
    doc.text(String(r.jobLabel || '—'), colX.job + 4, y + rowH - 7)
    doc.text(String(r.employeeName || ''), colX.emp + 4, y + rowH - 7)
    doc.setTextColor(102, 102, 102)
    doc.text(fmtDate(r.date), colX.date + 4, y + rowH - 7)
    doc.setTextColor(20, 20, 20)
    doc.text(fmtHrs(r.reg), colX.reg + 4, y + rowH - 7)
    doc.text(fmtHrs(r.ot), colX.ot + 4, y + rowH - 7)
    doc.text(r.pd ? String(r.pd) : '', colX.pd + 4, y + rowH - 7)
    doc.text(fmtHrs(r.shop), colX.shop + 4, y + rowH - 7)
    y += rowH
    doc.setDrawColor(240, 240, 240); doc.setLineWidth(0.75)
    doc.line(margin, y, tableRight, y)
  })

  ensureSpace()
  y += 6
  doc.setDrawColor(20, 20, 20); doc.setLineWidth(1)
  doc.line(margin, y, tableRight, y)
  y += rowH - 5
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.setTextColor(20, 20, 20)
  doc.text('TOTAL', colX.job + 4, y)
  doc.text(fmtHrs(totalReg), colX.reg + 4, y)
  doc.text(fmtHrs(totalOT), colX.ot + 4, y)
  doc.text(totalPD ? String(totalPD) : '', colX.pd + 4, y)
  doc.text(fmtHrs(totalShop), colX.shop + 4, y)
  y += 22

  doc.setFont('helvetica', 'italic'); doc.setFontSize(8)
  doc.setTextColor(136, 136, 136)
  doc.text('Shop hours are non-billable (Z200, Non Billable) — not included in Reg.', margin, y)
  doc.setTextColor(0, 0, 0)

  doc.save(`sage-sync_${dateFrom}_to_${dateTo}.pdf`)
}
