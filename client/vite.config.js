import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forward /api requests to the Express server during development
      '/api': {
        target:       'http://localhost:5000',
        changeOrigin: true,
        secure:       false,
      },
    },
  },
  build: {
    outDir:        'dist',
    sourcemap:     false,
    rollupOptions: {
      output: {
        // Split vendor chunks for better caching
        manualChunks: {
          react:    ['react', 'react-dom', 'react-router-dom'],
          recharts: ['recharts'],
        },
      },
    },
  },
});