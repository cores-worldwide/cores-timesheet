import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages serves this as a project page under /cores-timesheet/;
  // Netlify serves it from the domain root, so its build sets NETLIFY=true.
  base: process.env.NETLIFY ? '/' : '/cores-timesheet/',
  plugins: [react()],
  server: {
    port: 3001
  }
})
