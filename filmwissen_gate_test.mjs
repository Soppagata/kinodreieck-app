/* C11: Der bezahlte Filmwissen-Pfad besitzt ein eigenes Laufzeitgate.
   Reiner JSDOM-/Mock-Test: kein Netz, kein Anbieter, keine echten Kosten. */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import {
  istFilmwissenRechercheFreigegeben,
  useIntelligenceController,
} from "./src/controllers/useIntelligenceController.js";
import { KI_WAHL_VERSION } from "./src/lib/kiSchalter.js";

let ok = 0;
function check(name, wert) {
  if (!wert) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

const bereit = Object.freeze({
  mode: "account",
  state: "ready",
  account: Object.freeze({ id: "konto-c11" }),
  capabilities: Object.freeze({ personalAi: true }),
});

check("Das pure Gate erlaubt Filmwissen nur einer bereiten Personal-AI-Kontositzung",
  istFilmwissenRechercheFreigegeben(bereit, true)
  && !istFilmwissenRechercheFreigegeben(bereit, false)
  && !istFilmwissenRechercheFreigegeben({ ...bereit, state: "degraded" }, true)
  && !istFilmwissenRechercheFreigegeben({
    ...bereit,
    capabilities: { personalAi: false },
  }, true)
  && !istFilmwissenRechercheFreigegeben({
    ...bereit,
    mode: "guest",
    account: null,
  }, true)
  && !istFilmwissenRechercheFreigegeben({
    ...bereit,
    account: { id: "" },
  }, true));

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function speichereKiStand({ global, vorbewertung, filmwissen }) {
  localStorage.clear();
  localStorage.setItem("kd:ki", JSON.stringify({
    global,
    funktionen: { vorbewertung, filmwissen },
    gefragtAm: "2026-08-08T12:00:00.000Z",
  }));
  localStorage.setItem("kd:ki-version", KI_WAHL_VERSION);
}

async function mounteController(kiStand) {
  speichereKiStand(kiStand);
  const rufe = { lesen: 0, recherche: 0, bestaetigung: 0, invalidierung: 0 };
  const filmwissenDienst = {
    async read() {
      rufe.lesen++;
      return { format: "filmwissen-cache-v1", status: "cache_miss" };
    },
    async recherchiere() {
      rufe.recherche++;
      return { format: "filmwissen-cache-v1", status: "nicht_belegt" };
    },
    invalidate() { rufe.invalidierung++; },
  };
  window.confirm = () => { rufe.bestaetigung++; return true; };

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let api = null;
  function Harness() {
    api = useIntelligenceController({
      tab: "daten",
      session: bereit,
      master: [],
      masterMeta: {},
      mustwatch: [],
      mitMustwatch: (filme) => filme,
      naechsteHerkunft: () => "c11-test",
      mutiereMaster: async () => true,
      schreibeArtikel: () => {},
      setErr: () => {},
      filmwissenDienst,
    });
    return null;
  }

  await act(async () => {
    root.render(React.createElement(Harness));
    await tick();
  });

  return {
    api: () => api,
    rufe,
    async cleanup() {
      await act(async () => { root.unmount(); });
      container.remove();
    },
  };
}

let fixture = await mounteController({
  global: true,
  vorbewertung: true,
  filmwissen: false,
});
check("Vorbewertung AN öffnet den separat ausgeschalteten Filmwissen-Pfad nicht",
  fixture.api().vorbewertungAktiv === true
  && fixture.api().filmwissenRechercheAktiv === false
  && fixture.api().filmwissenLesenAktiv === true);
let ergebnis;
await act(async () => {
  ergebnis = await fixture.api().recherchiereFilmwissen({ id: "film-c11" });
  await tick();
});
check("Das geschlossene Filmwissen-Gate fragt nicht nach und ruft keinen Dienst auf",
  ergebnis === false
  && fixture.rufe.bestaetigung === 0
  && fixture.rufe.recherche === 0);
await act(async () => {
  await fixture.api().ladeFilmwissen({ id: "film-c11", imdb_id: "tt0000001" });
  await tick();
});
check("Gespeichertes Filmwissen bleibt trotz ausgeschalteter Recherche account-only lesbar",
  fixture.rufe.lesen === 1);
await fixture.cleanup();

fixture = await mounteController({
  global: true,
  vorbewertung: true,
  filmwissen: undefined,
});
check("Eine gültige e8-v1-Bestandswahl behält Vorbewertung, öffnet aber Filmwissen nicht",
  fixture.api().vorbewertungAktiv === true
  && fixture.api().filmwissenRechercheAktiv === false);
await act(async () => {
  ergebnis = await fixture.api().recherchiereFilmwissen({ id: "film-c11" });
  await tick();
});
check("Der Bestandsstand ohne Filmwissen-Feld erreicht weder Bestätigung noch Filmwissen-Dienst",
  ergebnis === false
  && fixture.rufe.bestaetigung === 0
  && fixture.rufe.recherche === 0);
await fixture.cleanup();

fixture = await mounteController({
  global: true,
  vorbewertung: false,
  filmwissen: true,
});
check("Filmwissen AN bleibt bei Vorbewertung AUS eigenständig freigegeben",
  fixture.api().vorbewertungAktiv === false
  && fixture.api().filmwissenRechercheAktiv === true);
await act(async () => {
  await fixture.api().recherchiereFilmwissen({ id: "film-c11", imdb_id: "tt0000001" });
  await tick();
});
check("Der freigegebene Verbrauchspfad erreicht nach Bestätigung genau einmal den Mock-Dienst",
  fixture.rufe.bestaetigung === 1 && fixture.rufe.recherche === 1);
await fixture.cleanup();

fixture = await mounteController({
  global: false,
  vorbewertung: true,
  filmwissen: true,
});
check("Der globale KI-Schalter schließt auch einen lokal auf AN stehenden Filmwissen-Pfad",
  fixture.api().vorbewertungAktiv === false
  && fixture.api().filmwissenRechercheAktiv === false);
await act(async () => {
  ergebnis = await fixture.api().recherchiereFilmwissen({ id: "film-c11" });
  await tick();
});
check("Bei global AUS bleiben Bestätigung und Filmwissen-Dienst unberührt",
  ergebnis === false
  && fixture.rufe.bestaetigung === 0
  && fixture.rufe.recherche === 0);
await fixture.cleanup();

localStorage.clear();
dom.window.close();
console.log(`filmwissen_gate_test: ${ok} Checks bestanden.`);
