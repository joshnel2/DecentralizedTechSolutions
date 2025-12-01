import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync } from 'node:fs'

// Plugin to copy staticwebapp.config.json to dist folder
const copyStaticWebAppConfig = () => ({
  name: 'copy-staticwebapp-config',
  closeBundle() {
    const src = 'staticwebapp.config.json'
    const dest = 'dist/staticwebapp.config.json'
    if (existsSync(src)) {
      copyFileSync(src, dest)
      console.log('✓ Copied staticwebapp.config.json to dist/')
    }
  }
})

export default defineConfig({
  plugins: [react(), copyStaticWebAppConfig()],
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})
