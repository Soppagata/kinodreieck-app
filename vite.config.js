import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* Die App besitzt bewusst einen gemeinsamen State-Owner in App.jsx. Statt die
   Tabs mit doppelter Lade-/Fehlerlogik zu versehen, schneiden wir den
   statischen Modulgraphen in azyklische Tiefenschichten. */
const chunkDepthCache = new Map()
function chunkDepth(id, getModuleInfo, active = new Set()) {
  if (chunkDepthCache.has(id)) return chunkDepthCache.get(id)
  if (active.has(id)) return 0
  const nextActive = new Set(active).add(id)
  const imports = getModuleInfo(id)?.importedIds || []
  const depth = imports.length
    ? 1 + Math.max(...imports.map((dependency) => chunkDepth(dependency, getModuleInfo, nextActive)))
    : 0
  chunkDepthCache.set(id, depth)
  return depth
}

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
  build: {
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id, { getModuleInfo }) {
          const path = id.replaceAll('\\', '/')
          if (path.includes('/node_modules/')) return 'vendor'
          if (!path.includes('/src/')) return undefined
          /* Drei Importebenen pro Chunk halten die Zahl der Requests klein und
             bewahren die Abhaengigkeitsrichtung zwischen den Schichten. */
          return `app-layer-${Math.floor(chunkDepth(id, getModuleInfo) / 3)}`
        },
      },
    },
  },
})
