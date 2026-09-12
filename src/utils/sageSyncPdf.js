import { jsPDF } from 'jspdf'
import { fmtHours } from './format'

// Reconciliation report against Sage 50's own Time Slips Journal / journal
// import shape. Columns confirmed 2026-09-12 (Jim) against a real Sage
// export (payroll.xlsx): Customer, Item, Description, Billing Status,
// Actual Time, Billable Amount, Payroll Time — Job # is added as our own
// leftmost reference column (not part of Sage's own shape) so a row can be
// tied back to a specific job; that's what jobnum_pref exists for.
//
// One row per ITEM LINE, not per job entry: a job entry with both Reg and
// OT hours produces two rows (Z 200 and Z 202), same as Sage's own journal
// does. Customer is the job's real customer, or the literal "_Shop"
// pseudo-customer for shop work (matching Sage's own naming) — "_shop is
// the only one that isn't billable" (Jim), so Billing Status is always
// "Non Billable " there regardless of item, and Billable Amount is 0.
// Everywhere else Billable Amount just mirrors the hours — there's no
// billing-rate table in this app to compute a real dollar figure, and the
// reference file's own values do the same (8 hours -> 8, not a $ amount).
//
// Only entries for a (employee, work_date) already stamped "Posted to
// Sage" belong in this report — anything not posted yet hasn't reached
// Sage to reconcile against.
//
// Styled to match the on-screen preview table in AdminDashboard.jsx's Sage
// Report tab (plain rows, thin light-grey dividers, grey uppercase header,
// no cell shading/grid). Landscape orientation — 10 columns don't fit a
// portrait letter page at a legible size.
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

// rows: [{ jobLabel, employeeName, date, customer, item, description, billingStatus, actualTime, billableAmount, payrollTime }]
export function generateSageSyncPDF({ dateFrom, dateTo, rows }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 36
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
    job: contentW * 0.075,
    emp: contentW * 0.12,
    date: contentW * 0.07,
    customer: contentW * 0.13,
    item: contentW * 0.06,
    description: contentW * 0.15,
    billing: contentW * 0.14,
    actual: contentW * 0.085,
    billable: contentW * 0.09,
    payroll: contentW * 0.08,
  }
  const colX = {}
  let cx = margin
  Object.entries(colW).forEach(([k, w]) => { colX[k] = cx; cx += w })
  const tableRight = margin + contentW
  const rowH = 18
  const headers = [
    ['job', 'JOB #'], ['emp', 'EMPLOYEE'], ['date', 'DATE'], ['customer', 'CUSTOMER'], ['item', 'ITEM'],
    ['description', 'DESCRIPTION'], ['billing', 'BILLING STATUS'], ['actual', 'ACTUAL'], ['billable', 'BILLABLE AMT'], ['payroll', 'PAYROLL'],
  ]

  function drawHeaderRow() {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
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

  let totalActual = 0, totalBillable = 0, totalPayroll = 0
  rows.forEach(r => {
    ensureSpace()
    // ensureSpace may have just redrawn the page header, which leaves the
    // pen on its own grey — reset before every row rather than relying on
    // the previous row's last color, or the first row of every page after
    // page 1 renders in the header's grey instead of black.
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
    doc.setTextColor(20, 20, 20)
    totalActual += Number(r.actualTime || 0)
    totalBillable += Number(r.billableAmount || 0)
    totalPayroll += Number(r.payrollTime || 0)
    doc.text(String(r.jobLabel || '—'), colX.job + 4, y + rowH - 7)
    doc.text(String(r.employeeName || ''), colX.emp + 4, y + rowH - 7)
    doc.setTextColor(102, 102, 102)
    doc.text(fmtDate(r.date), colX.date + 4, y + rowH - 7)
    doc.setTextColor(20, 20, 20)
    doc.text(String(r.customer || '—'), colX.customer + 4, y + rowH - 7)
    doc.text(String(r.item || ''), colX.item + 4, y + rowH - 7)
    doc.setTextColor(102, 102, 102)
    doc.text(String(r.description || '—'), colX.description + 4, y + rowH - 7)
    doc.setTextColor(...(r.billingStatus?.trim() === 'Non Billable' ? [160, 90, 0] : [45, 106, 56]))
    doc.text(String(r.billingStatus || ''), colX.billing + 4, y + rowH - 7)
    doc.setTextColor(20, 20, 20)
    doc.text(fmtHrs(r.actualTime), colX.actual + 4, y + rowH - 7)
    doc.text(fmtHrs(r.billableAmount), colX.billable + 4, y + rowH - 7)
    doc.text(fmtHrs(r.payrollTime), colX.payroll + 4, y + rowH - 7)
    y += rowH
    doc.setDrawColor(240, 240, 240); doc.setLineWidth(0.75)
    doc.line(margin, y, tableRight, y)
  })

  ensureSpace()
  y += 6
  doc.setDrawColor(20, 20, 20); doc.setLineWidth(1)
  doc.line(margin, y, tableRight, y)
  y += rowH - 5
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
  doc.setTextColor(20, 20, 20)
  doc.text('TOTAL', colX.job + 4, y)
  doc.text(fmtHrs(totalActual), colX.actual + 4, y)
  doc.text(fmtHrs(totalBillable), colX.billable + 4, y)
  doc.text(fmtHrs(totalPayroll), colX.payroll + 4, y)
  y += 22

  doc.setFont('helvetica', 'italic'); doc.setFontSize(8)
  doc.setTextColor(136, 136, 136)
  doc.text('Shop work (_Shop) is always Non Billable, regardless of item — Billable Amt is 0 there.', margin, y)
  doc.setTextColor(0, 0, 0)

  doc.save(`sage-sync_${dateFrom}_to_${dateTo}.pdf`)
}
