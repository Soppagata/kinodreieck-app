import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// base: './' hält Asset-, PWA- und Downloadpfade sowohl auf der eigenen Domain
// als auch auf Cloudflare-Preview-URLs und lokalen Unterpfaden funktionsfähig.
export default defineConfig({
  base: './',
  /* Offline-Beilagen gehoeren ausschliesslich in den lokalen Einzeldatei-Build.
     Das feste false erlaubt Rollup, diese Aeste samt Payload aus dem oeffentlich
     ausgelieferten Web-Bundle zu entfernen. */
  define: { __KD_SINGLE_FILE__: 'false' },
  plugins: [react()],
  build: { minify: 'esbuild', sourcemap: false },
})
