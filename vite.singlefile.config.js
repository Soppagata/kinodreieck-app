import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

/* Erzeugt EINE in sich geschlossene HTML-Datei (Doppelklick-Nutzung wie
   beim alten Artifact-HTML). Aufruf: npm run build:single
   assetsInlineLimit: hier (und NUR hier) werden alle Assets — v. a. die
   12 Font-Subsets — als Data-URIs eingebettet; der Web-Build (vite.config.js)
   liefert sie als eigene Dateien aus (schlankes CSS, unicode-range wirkt).

   KD_BETA=1 (nur Tests, betamodus_test.mjs): baut die Beta-Variante, indem
   der PERSONAL_MODE-Schalter in lib/modus.js beim Bundeln auf false gedreht
   wird — exakt das, was eine echte Beta-Auslieferung manuell täte. Der
   Quellcode bleibt unangetastet. */
const BETA = process.env.KD_BETA === '1'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    viteSingleFile(),
    BETA && {
      name: 'kd-beta-modus',
      transform(code, id) {
        if (id.replace(/\\/g, '/').endsWith('src/lib/modus.js')) {
          const neu = code.replace('export const PERSONAL_MODE = true', 'export const PERSONAL_MODE = false')
          if (neu === code) throw new Error('kd-beta-modus: PERSONAL_MODE-Schalter in modus.js nicht gefunden')
          return neu
        }
      },
    },
  ].filter(Boolean),
  build: { outDir: 'dist-single', assetsInlineLimit: 100000000 },
})
