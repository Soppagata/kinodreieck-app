import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// base: './' hält Asset-, PWA- und Downloadpfade sowohl auf der eigenen Domain
// als auch auf Cloudflare-Preview-URLs und lokalen Unterpfaden funktionsfähig.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { minify: 'esbuild', sourcemap: false },
})
