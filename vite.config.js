import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* Die App besitzt bewusst einen gemeinsamen State-Owner in App.jsx. Statt die
   Tabs mit doppelter Lade-/Fehlerlogik zu versehen, schneiden wir den
   statischen Modulgraphen in azyklische Tiefenschichten. */
export function chunkDepthsForGraph(moduleIds, getModuleInfo) {
  const ids = [...moduleIds]
  const known = new Set(ids)
  const importsById = new Map(ids.map((id) => [
    id,
    (getModuleInfo(id)?.importedIds || []).filter((dependency) => known.has(dependency)),
  ]))

  let nextIndex = 0
  const indices = new Map()
  const lowLinks = new Map()
  const stack = []
  const onStack = new Set()
  const components = []

  const connect = (id) => {
    indices.set(id, nextIndex)
    lowLinks.set(id, nextIndex)
    nextIndex += 1
    stack.push(id)
    onStack.add(id)

    for (const dependency of importsById.get(id) || []) {
      if (!indices.has(dependency)) {
        connect(dependency)
        lowLinks.set(id, Math.min(lowLinks.get(id), lowLinks.get(dependency)))
      } else if (onStack.has(dependency)) {
        lowLinks.set(id, Math.min(lowLinks.get(id), indices.get(dependency)))
      }
    }

    if (lowLinks.get(id) !== indices.get(id)) return
    const component = []
    let member
    do {
      member = stack.pop()
      onStack.delete(member)
      component.push(member)
    } while (member !== id)
    components.push(component)
  }

  for (const id of ids) if (!indices.has(id)) connect(id)

  const componentById = new Map()
  components.forEach((component, index) => {
    component.forEach((id) => componentById.set(id, index))
  })
  const dependenciesByComponent = components.map(() => new Set())
  for (const [id, imports] of importsById) {
    const source = componentById.get(id)
    for (const dependency of imports) {
      const target = componentById.get(dependency)
      if (source !== target) dependenciesByComponent[source].add(target)
    }
  }

  const depthByComponent = new Map()
  const componentDepth = (component) => {
    if (depthByComponent.has(component)) return depthByComponent.get(component)
    const dependencies = [...dependenciesByComponent[component]]
    const depth = dependencies.length
      ? 1 + Math.max(...dependencies.map(componentDepth))
      : 0
    depthByComponent.set(component, depth)
    return depth
  }

  return new Map(ids.map((id) => [id, componentDepth(componentById.get(id))]))
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
        manualChunks(id, { getModuleIds, getModuleInfo }) {
          const path = id.replaceAll('\\', '/')
          if (path.includes('/node_modules/')) return 'vendor'
          if (!path.includes('/src/')) return undefined
          /* Bewusst ohne builduebergreifenden Cache: Watch-Rebuilds sehen immer
             den aktuellen Graphen. Bei der kleinen Modulzahl bleibt die
             vollstaendige SCC-Berechnung waehrend des Builds guenstig. */
          const appIds = [...getModuleIds()].filter((moduleId) => moduleId.replaceAll('\\', '/').includes('/src/'))
          const chunkDepths = chunkDepthsForGraph(appIds, getModuleInfo)
          /* Zwei Importebenen pro Chunk halten die Zahl der Requests klein.
             Zyklische Modulkomponenten besitzen dieselbe berechnete Tiefe. */
          return `app-layer-${Math.floor((chunkDepths.get(id) || 0) / 2)}`
        },
      },
    },
  },
})
