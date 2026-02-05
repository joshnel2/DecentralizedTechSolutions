import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

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
    chunkSizeWarningLimit: 600, // Suppress warnings for chunks under 600KB
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // PDF parsing
          if (id.includes('pdfjs-dist')) {
            return 'pdf-worker'
          }
          // Document parsers
          if (id.includes('mammoth') || id.includes('xlsx')) {
            return 'doc-parsers'
          }
          // Charts library
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-')) {
            return 'charts'
          }
          // Date utilities
          if (id.includes('date-fns')) {
            return 'date-utils'
          }
          // React core
          if (id.includes('react-dom')) {
            return 'react-dom'
          }
          // Router
          if (id.includes('react-router')) {
            return 'router'
          }
          // State management
          if (id.includes('zustand')) {
            return 'state'
          }
          // Azure storage
          if (id.includes('@azure')) {
            return 'azure'
          }
          // Icons
          if (id.includes('lucide-react')) {
            return 'icons'
          }
          // All other vendor chunks
          if (id.includes('node_modules')) {
            return 'vendor'
          }
        }
      }
    }
  }
})
