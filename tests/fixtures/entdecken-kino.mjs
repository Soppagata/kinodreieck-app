import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const esbuild = createRequire(import.meta.resolve("vite"))("esbuild");
export async function buildEntdeckenKinoFixture() {
  const result = await esbuild.build({
    stdin: { resolveDir: fileURLToPath(new URL("../../", import.meta.url)), loader: "jsx", contents: `
      import React, { useState } from "react";
      import { createRoot } from "react-dom/client";
      import { EntdeckenTab } from "./src/tabs/EntdeckenTab.jsx";
      import { StartTab } from "./src/tabs/StartTab.jsx";
      import { KinoTab } from "./src/tabs/KinoTab.jsx";
      import { ENTDECKEN_MARKET_POOL_50 } from "./src/data/entdeckenMarketPool50.js";
      import { normalizeEntdeckenPins, toggleEntdeckenPin } from "./src/lib/entdeckenPins.js";
      import "./src/index.css";
      const feed = { ...ENTDECKEN_MARKET_POOL_50, items: ENTDECKEN_MARKET_POOL_50.items.map((item, index) => index === 0
        ? { ...item, title: "Cars (20. Jubiläum)", releaseYear: 2006 } : item) };
      const film = { film_at_id: "98001", t: "Ein aktueller Film im Wiener Kinoprogramm", j: 2026,
        b: "Ein Film mit einer bestätigten kommenden Vorstellung.", k: ["Testkino"], z: ["Di 15.9. 20:00 · Testkino"] };
      const program = { filme: [film], events: [], demnaechst: [] };
      const emptyCatalog = { region: "AT", titel: [] };
      function Fixture() {
        const [tab, setTab] = useState("entdecken");
        const [pins, setPins] = useState(() => normalizeEntdeckenPins(JSON.parse(localStorage.getItem("fixture:pins") || "[]")));
        const [focus, setFocus] = useState(null);
        const [expanded, setExpanded] = useState(null);
        const toggle = entry => setPins(previous => {
          const next = toggleEntdeckenPin(previous, entry);
          localStorage.setItem("fixture:pins", JSON.stringify(next));
          return next;
        });
        return <><nav aria-label="Testnavigation">
          <button onClick={() => setTab("entdecken")}>Empfehlungen öffnen</button>
          <button onClick={() => setTab("start")}>Start öffnen</button>
        </nav>
        {tab === "entdecken" ? <EntdeckenTab master={[]} selectedServices={[]} streamingDiscover={emptyCatalog}
          webDiscoveryFeed={feed} programm={program} recommendationPins={pins} onRecommendationPinToggle={toggle} /> : null}
        {tab === "start" ? <StartTab entdeckenPins={pins} webDiscoveryFeed={feed} programm={program}
          streamingEntdecken={emptyCatalog} streamingBekannt={emptyCatalog}
          kinoMatches={{ matched: [], rest: [film] }} progStand={Date.now()}
          wochenplan={{ version: 1, eintraege: [] }} onWochenplanAendern={() => {}}
          onSpringeZuKino={entry => { setFocus({ art: "programm", ref: entry.programm_ref, titel: entry.titel }); setTab("kino"); }} /> : null}
        {tab === "kino" ? <KinoTab angemeldet programm={program} master={[]}
          kinoMatches={{ matched: [], rest: [film] }} restSichtbar={[film]}
          zeitgrenze="14:00" saveZeitgrenze={() => {}} zeigeAlles setZeigeAlles={() => {}}
          expandedId={expanded} setExpandedId={setExpanded} updateFilm={() => {}} addFilm={() => {}}
          fokusTreffer={focus} onFokusVerbraucht={() => {}} /> : null}</>;
      }
      createRoot(document.getElementById("fixture")).render(<Fixture />);
    ` },
    outfile: "entdecken-kino-fixture.js", write: false, bundle: true, format: "iife",
    jsx: "automatic", target: "es2022", define: { "import.meta.env": "{}" },
    loader: { ".woff2": "dataurl" }, logLevel: "silent",
  });
  return {
    js: result.outputFiles.find(file => file.path.endsWith(".js")).text,
    css: result.outputFiles.find(file => file.path.endsWith(".css")).text,
  };
}
