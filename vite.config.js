import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        ai: 'ai.html',
        apps: 'apps.html',
        business: 'business.html',
        consult: 'consult.html',
        contact: 'contact.html',
        ethereal: 'ethereal.html',
        hosting: 'hosting.html',
        booking: 'booking.html',
        smartcontracts: 'smartcontracts.html',
        websites: 'websites.html'
      }
    }
  }
});