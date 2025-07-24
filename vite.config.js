import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        ai: 'ai.html'
      }
    }
  }
});