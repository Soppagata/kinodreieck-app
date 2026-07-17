import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// base: './' => relative Asset-Pfade. Nötig, weil GitHub Pages die App unter
// einem Unterpfad (…/kinodreieck-app/) ausliefert — absolute Pfade wie /assets
// bzw. /favicon.svg würden dort brechen.
export default defineConfig({
  base: './',
  plugins: [react()],
})
