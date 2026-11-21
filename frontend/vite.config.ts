import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development the Django backend runs on :8000; proxying keeps everything same-origin
// so session cookies and CSRF work exactly like behind nginx in production.
const backend = process.env.BACKEND_URL ?? 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // Libraries change less often than the app, so keep them in their own files: after an
        // update, browsers only download the app's part again. OCR and barcode code is only
        // loaded when used.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\/](react|react-dom|scheduler|react-router)[\/]/, priority: 30 },
            { name: 'mantine', test: /node_modules[\/]@mantine[\/]/, priority: 20 },
            { name: 'apollo', test: /node_modules[\/](@apollo|graphql|@wry|optimism|rxjs|tslib)[\/]/, priority: 20 },
            { name: 'icons', test: /node_modules[\/]@tabler[\/]/, priority: 20 },
            { name: 'capacitor', test: /node_modules[\/]@capacitor[\/]/, priority: 20 },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/graphql': backend,
      '/api': backend,
      '/admin': backend,
      '/static': backend,
      '/media': backend,
    },
  },
})
