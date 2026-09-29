import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Identifies this build so an already-open page can tell when a newer one has
// been deployed (see components/UpdateBanner.jsx). GitHub Actions and Netlify
// both expose the commit; a local build just gets a timestamp.
const BUILD_ID = process.env.GITHUB_SHA || process.env.COMMIT_REF || `local-${Date.now()}`

// Publishes the same id as /version.json next to index.html, so the running
// page can fetch it and compare against the id baked into its own bundle.
const emitVersionFile = {
  name: 'emit-version-json',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID }) })
  },
}

export default defineConfig({
  // GitHub Pages serves this as a project page under /cores-timesheet/;
  // Netlify serves it from the domain root, so its build sets NETLIFY=true.
  base: process.env.NETLIFY ? '/' : '/cores-timesheet/',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [react(), emitVersionFile],
  server: {
    port: 3001
  }
})
