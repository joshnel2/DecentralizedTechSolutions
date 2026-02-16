import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync } from 'node:fs'

// Plugin to copy required assets to dist folder
const copyAssets = () => ({
  name: 'copy-assets',
  buildStart() {
    // Copy PDF.js worker to public folder for dev mode
    const pdfWorkerSrc = 'node_modules/pdfjs-dist/build/pdf.worker.min.js'
    const pdfWorkerDest = 'public/pdf.worker.min.js'
    if (existsSync(pdfWorkerSrc) && !existsSync(pdfWorkerDest)) {
      try {
        copyFileSync(pdfWorkerSrc, pdfWorkerDest)
        console.log('✓ Copied pdf.worker.min.js to public/')
      } catch (e) {
        console.warn('Could not copy PDF worker to public:', e)
      }
    }
  },
  closeBundle() {
    // Copy staticwebapp.config.json
    const staticSrc = 'staticwebapp.config.json'
    const staticDest = 'dist/staticwebapp.config.json'
    if (existsSync(staticSrc)) {
      copyFileSync(staticSrc, staticDest)
      console.log('✓ Copied staticwebapp.config.json to dist/')
    }
    
    // Copy PDF.js worker to dist folder for production
    const pdfWorkerSrc = 'node_modules/pdfjs-dist/build/pdf.worker.min.js'
    const pdfWorkerDest = 'dist/pdf.worker.min.js'
    if (existsSync(pdfWorkerSrc)) {
      try {
        copyFileSync(pdfWorkerSrc, pdfWorkerDest)
        console.log('✓ Copied pdf.worker.min.js to dist/')
      } catch (e) {
        console.warn('Could not copy PDF worker:', e)
      }
    }
  }
})

export default defineConfig({
  plugins: [react(), copyAssets()],
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  optimizeDeps: {
    include: ['pdfjs-dist', 'mammoth', 'xlsx']
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'pdf-worker': ['pdfjs-dist'],
          'doc-parsers': ['mammoth', 'xlsx']
        }
      }
    }
  }
})
