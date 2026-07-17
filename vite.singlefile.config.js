import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

/* Erzeugt EINE in sich geschlossene HTML-Datei (Doppelklick-Nutzung wie
   beim alten Artifact-HTML). Aufruf: npm run build:single */
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { outDir: 'dist-single' },
})
