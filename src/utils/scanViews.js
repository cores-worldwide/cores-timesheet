// Turns a scan (PDF or photo) into the images the scan-report function reads:
// the whole page plus zoomed-in crops of the grid, cut using the template's
// `zoom` geometry (src/utils/reportTemplates.js).
//
// Why crops: two reads of the same whole page were seen agreeing on the same
// misread digit (a crossed 7 read as a 2, 2026-10-30). Zoomed crops, with the
// row labels and column headings pasted alongside, fixed that in testing.
// Read A gets half-width crops and read B full-width ones, so the two reads
// don't look at exactly the same pixels.

const MAX_EDGE = 2576 // longest edge Claude takes without downscaling
const RENDER_WIDTH = 4400 // ~400 dpi across a letter page
const JPEG_QUALITY = 0.9

async function renderPdf(file) {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  if (pdf.numPages > 1) throw new Error(`That PDF has ${pdf.numPages} pages. Scan one sheet at a time.`)
  const page = await pdf.getPage(1)
  const base = page.getViewport({ scale: 1 }) // includes the page's own rotation
  const viewport = page.getViewport({ scale: RENDER_WIDTH / Math.max(base.width, base.height) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas
}

async function renderImage(file) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d').drawImage(bitmap, 0, 0)
  return canvas
}

function toJpeg(canvas) {
  let src = canvas
  const longest = Math.max(canvas.width, canvas.height)
  if (longest > MAX_EDGE) {
    const r = MAX_EDGE / longest
    src = document.createElement('canvas')
    src.width = Math.round(canvas.width * r)
    src.height = Math.round(canvas.height * r)
    const ctx = src.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(canvas, 0, 0, src.width, src.height)
  }
  return { media_type: 'image/jpeg', data: src.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1] }
}

// Builds the views from the rendered page. Geometry is in the template's own
// units (zoom.width wide), scaled to the page; boxes are clamped to the page.
export function buildViews(page, zoom) {
  const k = page.width / zoom.width
  const pad = zoom.pad
  const clampBox = (x0, y0, x1, y1) => {
    const a = Math.max(0, Math.round(x0 * k)), b = Math.max(0, Math.round(y0 * k))
    const c = Math.min(page.width, Math.round(x1 * k)), d = Math.min(page.height, Math.round(y1 * k))
    return [a, b, Math.max(1, c - a), Math.max(1, d - b)]
  }
  const crop = (x0, y0, x1, y1) => {
    const [sx, sy, w, h] = clampBox(x0, y0, x1, y1)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    c.getContext('2d').drawImage(page, sx, sy, w, h, 0, 0, w, h)
    return c
  }
  // Column headings pasted across the top and row labels down the left, so a
  // crop of a low section still says which column and row each value is in.
  const grid = (c0, c1, y0, y1) => {
    const x0 = zoom.cols[c0] - pad, x1 = zoom.cols[c1] + pad
    const [h0, h1] = zoom.headingRow
    const parts = {
      labelHead: crop(zoom.labelCol[0], h0 - 4, zoom.labelCol[1], h1 + 4),
      head: crop(x0, h0 - 4, x1, h1 + 4),
      labelBody: crop(zoom.labelCol[0], y0 - pad, zoom.labelCol[1], y1 + pad),
      body: crop(x0, y0 - pad, x1, y1 + pad),
    }
    const out = document.createElement('canvas')
    out.width = parts.labelBody.width + parts.body.width
    out.height = parts.head.height + parts.body.height
    const ctx = out.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.drawImage(parts.labelHead, 0, 0)
    ctx.drawImage(parts.head, parts.labelBody.width, 0)
    ctx.drawImage(parts.labelBody, 0, parts.head.height)
    ctx.drawImage(parts.body, parts.labelBody.width, parts.head.height)
    return out
  }

  const n = zoom.cols.length - 1
  const half = Math.ceil(n / 2)
  const [hx0, hy0, hx1, hy1] = zoom.headerBox
  const mid = (hx0 + hx1) / 2
  const viewsA = [{ label: 'Header fields', ...toJpeg(crop(hx0, hy0, hx1, hy1)) }]
  const viewsB = [
    { label: 'Header fields, left half', ...toJpeg(crop(hx0, hy0, mid + 60, hy1)) },
    { label: 'Header fields, right half', ...toJpeg(crop(mid - 60, hy0, hx1, hy1)) },
  ]
  for (const s of zoom.sections) {
    const what = `${s.label} rows ${s.rows}`
    viewsA.push({ label: `${what}, measurement columns 1-${half}`, ...toJpeg(grid(0, half, s.y[0], s.y[1])) })
    viewsA.push({ label: `${what}, measurement columns ${half + 1}-${n}`, ...toJpeg(grid(half, n, s.y[0], s.y[1])) })
    viewsB.push({ label: `${what}, all ${n} measurement columns`, ...toJpeg(grid(0, n, s.y[0], s.y[1])) })
  }
  return { page: toJpeg(page), views_a: viewsA, views_b: viewsB }
}

export async function scanToViews(file, zoom) {
  const page = file.type === 'application/pdf' ? await renderPdf(file) : await renderImage(file)
  // The geometry is for an upright landscape sheet.
  if (page.height > page.width) throw new Error('The scan is in portrait. Please rotate it to landscape (the way the sheet is printed) and try again.')
  return buildViews(page, zoom)
}
