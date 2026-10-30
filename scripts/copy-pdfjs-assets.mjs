// Copies pdf.js's image decoders and standard fonts into public/pdfjs/ so the
// app serves them. Scanner PDFs store the page as JPEG 2000 / JBIG2 images,
// which pdf.js can only decode with these files; without them the scan renders
// blank (Scan to Report, 2026-10-30). Runs before `npm run dev` and `npm run
// build`; the output is not committed (.gitignore).
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const from = path.join(root, 'node_modules', 'pdfjs-dist')
const to = path.join(root, 'public', 'pdfjs')
for (const dir of ['wasm', 'standard_fonts']) {
  fs.rmSync(path.join(to, dir), { recursive: true, force: true })
  fs.cpSync(path.join(from, dir), path.join(to, dir), { recursive: true })
}
console.log('copied pdf.js wasm + standard_fonts to public/pdfjs/')
