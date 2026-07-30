import { erstelleVorbewertung, pruefeVorbewertungsBereitschaft } from "./src/services/vorbewertung.js";
import { erteileEinwilligung, leeresProfil } from "./src/lib/profil.js";
import { pruefePrognose } from "./src/lib/prognose.js";

let ok = 0;
const rot = [];
async function check(name, fn) {
  try {
    if (!await fn()) throw new Error("falsch");
    ok++;
    console.log("✓ " + name);
  } catch (e) {
    rot.push(name);
    console.error("✗ " + name + ": " + (e?.message || e));
  }
}

const film = {
  id: "alien_1979", titel: "Alien", originaltitel: "Alien", jahr: 1979,
  typ: "film", genre: ["horror"], tags: ["düster"], bewertung: null,
};
const leer = erteileEinwilligung(leeresProfil(), "2026-07-29T12:00:00.000Z", "v1");
const profil = {
  ...leer,
  version: "p2",
  signale: [{
    art: "genre", wert: "horror", richtung: "zieht_an", staerke: 5,
    sicherheit: "hoch", quelle: "schlagwort", beleg: "schlagwort:horror",
    erfasst: "2026-07-29T12:00:00.000Z", bestaetigt: "2026-07-29T12:00:00.000Z",
  }],
};
const antwort = {
  ok: true,
  vorgangId: "00000000-0000-4000-8000-000000000008",
  modell: "claude-sonnet-5-20260715",
  modellAlias: "gross",
  data: {
    format: "film-prognose-v1",
    achsen: { wie: 4, was: 3, warum: 4 },
    passung: 78,
    kategorie_vorschlag: "kult",
    sicherheit: "sehr_niedrig",
    begruendung: "Die dichte Inszenierung passt zu deinem bestätigten Horror-Signal.",
    verwendete_signale: [{ id: "S1", art: "genre", wert: "horror", richtung: "zieht_an" }],
  },
  verbrauch: { inputTokens: 700, outputTokens: 180, kostenUsdCent: 0.5, dauerMs: 1200, stopReason: "end_turn" },
};

function aiDoppel(rueckgabe = antwort) {
  const rufe = [];
  return {
    rufe,
    ai: {
      async runTask(...args) {
        rufe.push(args);
        return rueckgabe;
      },
    },
  };
}

await check("Bereitschaft ist rein lokal und erkennt das bestätigte Profil", () =>
  pruefeVorbewertungsBereitschaft(film, profil).ok);
await check("genau ein Task-Aufruf erzeugt eine strikt gültige Prognose", async () => {
  const d = aiDoppel();
  const p = await erstelleVorbewertung(film, {
    profil, ai: d.ai, jetzt: "2026-07-29T13:00:00.000Z",
  });
  return d.rufe.length === 1 && pruefePrognose(p).length === 0 && p.status === "offen";
});
await check("Aufgabe, Payload und Profilversion gehen an die richtige Grenze", async () => {
  const d = aiDoppel();
  await erstelleVorbewertung(film, { profil, ai: d.ai });
  const [task, payload, optionen] = d.rufe[0];
  return task === "film-forecast" && optionen.profilVersion === "p2"
    && optionen.promptVersion === "v2"
    && Object.keys(payload).sort().join(",") === "film,profil";
});
await check("Vorgangs-ID und Abbruchsignal werden ohne Retry durchgereicht", async () => {
  const d = aiDoppel();
  const signal = new AbortController().signal;
  await erstelleVorbewertung(film, {
    profil, ai: d.ai, signal, vorgangId: "11111111-1111-4111-8111-111111111111",
  });
  return d.rufe.length === 1
    && d.rufe[0][2].signal === signal
    && d.rufe[0][2].vorgangId === "11111111-1111-4111-8111-111111111111";
});
await check("ungültiger Film stoppt vor jedem bezahlbaren Aufruf", async () => {
  const d = aiDoppel();
  await erstelleVorbewertung({ ...film, bewertung: { wie: 1, was: 1, warum: 1 } }, {
    profil, ai: d.ai,
  }).catch(() => {});
  return d.rufe.length === 0;
});
await check("leeres Profil stoppt vor jedem bezahlbaren Aufruf", async () => {
  const d = aiDoppel();
  await erstelleVorbewertung(film, { profil: { ...profil, signale: [] }, ai: d.ai }).catch(() => {});
  return d.rufe.length === 0;
});
await check("fehlende tatsächliche Modell-ID macht die Antwort ungültig", async () => {
  const d = aiDoppel({ ...antwort, modell: undefined });
  let abgewiesen = false;
  await erstelleVorbewertung(film, { profil, ai: d.ai }).catch(() => { abgewiesen = true; });
  return d.rufe.length === 1 && abgewiesen;
});
await check("gültige persönliche WARUM-Schätzung wird getrennt gespeichert", async () => {
  const d = aiDoppel();
  const p = await erstelleVorbewertung(film, { profil, ai: d.ai });
  return p?.ergebnis.achsen.warum === 4 && !("bewertung" in p);
});
await check("ungültiger WARUM-Wert aus einer manipulierten Antwort wird nie gespeichert", async () => {
  const d = aiDoppel({ ...antwort, data: { ...antwort.data, achsen: { wie: 4, was: 3, warum: 6 } } });
  let p = null;
  await erstelleVorbewertung(film, { profil, ai: d.ai }).then((x) => { p = x; }).catch(() => {});
  return p === null;
});
await check("ein Taskfehler wird nicht automatisch wiederholt", async () => {
  const rufe = [];
  const ai = { async runTask() { rufe.push(1); throw new Error("offline"); } };
  await erstelleVorbewertung(film, { profil, ai }).catch(() => {});
  return rufe.length === 1;
});

console.log(`\n${ok}/${ok + rot.length} Vorbewertungs-Service-Checks bestanden.`);
if (rot.length) process.exit(1);
