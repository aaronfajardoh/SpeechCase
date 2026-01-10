import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor chunks
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions', 'firebase/storage'],
          'pdf-vendor': ['pdfjs-dist', 'pdf-lib'],
          'mermaid-vendor': ['mermaid'],
          'ui-vendor': ['react-markdown'],
        },
        // Limit chunk size to help with Firebase deployment
        chunkSizeWarningLimit: 1000,
      },
    },
    // Increase chunk size limit for build warnings, but manual chunks will keep files smaller
    chunkSizeWarningLimit: 1000,
  },
})

