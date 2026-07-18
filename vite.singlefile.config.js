import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

/* Erzeugt EINE in sich geschlossene HTML-Datei (Doppelklick-Nutzung wie
   beim alten Artifact-HTML). Aufruf: npm run build:single
   assetsInlineLimit: hier (und NUR hier) werden alle Assets — v. a. die
   12 Font-Subsets — als Data-URIs eingebettet; der Web-Build (vite.config.js)
   liefert sie als eigene Dateien aus (schlankes CSS, unicode-range wirkt). */
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: { outDir: 'dist-single', assetsInlineLimit: 100000000 },
})
