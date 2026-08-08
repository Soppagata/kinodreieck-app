import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

/* Erzeugt EINE in sich geschlossene HTML-Datei (Doppelklick-Nutzung wie
   beim alten Artifact-HTML). Aufruf: npm run build:single
   assetsInlineLimit: hier (und NUR hier) werden alle Assets — v. a. die
   12 Font-Subsets — als Data-URIs eingebettet; der Web-Build (vite.config.js)
   liefert sie als eigene Dateien aus (schlankes CSS, unicode-range wirkt).

   Auch die Doppelklick-Datei verwendet denselben Tester-Modus wie die PWA. */
export default defineConfig({
  base: './',
  /* Die Einzeldatei bettet ihre kleine Demo-Beilage in build-single.mjs ein.
     public/ darf deshalb nicht zusätzlich als scheinbar nötiger Nebenordner in
     dist-single landen. Der normale Web-Build kopiert public/ weiterhin. */
  publicDir: false,
  define: {
    __KD_SINGLE_FILE__: 'true',
  },
  plugins: [
    react(),
    viteSingleFile(),
  ],
  build: { outDir: 'dist-single', assetsInlineLimit: 100000000 },
})
