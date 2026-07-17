/* ============================================================
   Wikidata-Resolver (Phase 3) — deterministisch, ohne Key, CC0
   ------------------------------------------------------------
   Löst zu einem Kinoprogramm-Titel das Erscheinungsjahr auf.
   Quelle: Wikidata MediaWiki Action API (wbsearchentities + wbgetentities),
   `origin=*` für Browser-CORS. KEINE Watchmode-Requests. Kein LLM. Kein Raten:
   mehrdeutig ODER kein Film-Kandidat -> jahr=null (lieber leer als falsch —
   ein falsches Jahr zerstört das Matching gegen die Masterliste).

   Property-IDs — Stand 2026, VOR Produktiv-Einsatz gegen Wikidata verifizieren
   (im Browser, wo Wikidata erreichbar ist):
     P31  instance of        P577 publication date   P2047 duration
     P1476 title             P179 part of the series  P8345 media franchise
     P57  director           P495 country of origin
   Film-Typen (P31): Q11424 (Film) + gängige Unterklassen.
   RARS (russische Altersfreigabe) wird NICHT gezogen (für AT irrelevant).
   ============================================================ */

export const WD = {
  API: "https://www.wikidata.org/w/api.php",
  P: { instanceOf: "P31", publication: "P577", duration: "P2047", title: "P1476", series: "P179", franchise: "P8345", director: "P57", country: "P495" },
  Q_FILM: "Q11424",
  // Film + verbreitete Unterklassen (Kurzfilm, Animationsfilm, TV-Film, 3D-Film,
  // Spielfilm, Dokumentarfilm, Stummfilm). Bei Bedarf im Browser erweitern.
  FILM_TYPEN: new Set(["Q11424", "Q24862", "Q202866", "Q506240", "Q229390", "Q24869", "Q93204", "Q226730"]),
};

function jsonUrl(params) {
  const u = new URL(WD.API);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  u.searchParams.set("format", "json");
  // origin=* NUR im Browser (CORS, auch für file://-null-Origin). In Node NICHT:
  // anonyme CORS-Requests werden von Wikimedia deutlich strenger rate-limitet
  // (periodisches 429) — server-seitig mit User-Agent gilt das höhere Limit.
  if (typeof window !== "undefined") u.searchParams.set("origin", "*");
  return u.toString();
}

async function holRoh(url, fetchImpl, versuch = 0) {
  const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!f) throw new Error("kein fetch verfügbar");
  // Wikimedia verlangt einen aussagekräftigen User-Agent — ohne -> 429/Block.
  // Im Browser ist der User-Agent-Header verboten (wird verworfen), daher nur in Node.
  const headers = { Accept: "application/json" };
  if (typeof window === "undefined") headers["User-Agent"] = "Kinodreieck/1.0 (privates, nicht-kommerzielles Projekt; Kinoprogramm-Jahresaufloesung)";
  const res = await f(url, { headers });
  if (res && res.status === 429 && versuch < 4) {           // Rate-Limit: gestaffelter Backoff
    await new Promise((r) => setTimeout(r, 2000 * (versuch + 1)));
    return holRoh(url, fetchImpl, versuch + 1);
  }
  if (!res || !res.ok) throw new Error("Wikidata HTTP " + (res ? res.status : "?"));
  return res.json();
}

/* Serialisiert ALLE echten Wikidata-Calls mit ~1,1 s Mindestabstand (Wikimedia-
   Etikette für anonyme Clients) — kein Bursting mehr, das war die 429-Ursache.
   Mit injiziertem fetch (Tests) wird NICHT gepaced (bleibt schnell). */
let _wdKette = Promise.resolve();
let _wdLetzter = 0;
const WD_ABSTAND_MS = 1500;
function hol(url, fetchImpl) {
  if (fetchImpl) return holRoh(url, fetchImpl); // Test/injiziert -> ohne Pacing
  const p = _wdKette.then(async () => {
    const seit = Date.now() - _wdLetzter;
    if (seit < WD_ABSTAND_MS) await new Promise((r) => setTimeout(r, WD_ABSTAND_MS - seit));
    _wdLetzter = Date.now();
    return holRoh(url, null);
  });
  _wdKette = p.catch(() => {}); // Kette lebt weiter, Fehler trägt der Aufrufer
  return p;
}

/* Frühestes Jahr aus P577 (publication date). Zeit-Wert ist ISO mit Vorzeichen. */
export function jahrAusClaims(claims) {
  const p = (claims && claims[WD.P.publication]) || [];
  let min = null;
  for (const c of p) {
    const t = c && c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value && c.mainsnak.datavalue.value.time;
    const m = t && /^[+-]?(\d{4})/.exec(t);
    if (m) { const y = Number(m[1]); if (min === null || y < min) min = y; }
  }
  return min;
}

/* Laufzeit in Minuten aus P2047 (Quantity; Minuten sind der Normalfall). */
export function laufzeitAusClaims(claims) {
  const p = (claims && claims[WD.P.duration]) || [];
  for (const c of p) {
    const v = c && c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value;
    if (v && v.amount != null) { const n = Math.abs(parseFloat(v.amount)); if (n > 0) return Math.round(n); }
  }
  return null;
}

function ersterClaimId(claims, prop) {
  const p = (claims && claims[prop]) || [];
  const v = p[0] && p[0].mainsnak && p[0].mainsnak.datavalue && p[0].mainsnak.datavalue.value;
  return (v && v.id) || null;
}

export function istFilm(claims) {
  const p = (claims && claims[WD.P.instanceOf]) || [];
  return p.some((c) => {
    const id = c && c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value && c.mainsnak.datavalue.value.id;
    return id && WD.FILM_TYPEN.has(id);
  });
}

/* Kandidaten-QIDs für einen Titel (wbsearchentities). */
async function suche(titel, sprache, fetchImpl) {
  const j = await hol(jsonUrl({ action: "wbsearchentities", search: titel, language: sprache, uselang: sprache, type: "item", limit: 10 }), fetchImpl);
  return (j && j.search || []).map((s) => s.id).filter(Boolean);
}

const leerResultat = () => ({ jahr: null, wikidata_qid: null, laufzeit: null, regie: null, franchise: null, reihe: null });

/* Hauptfunktion. titel (Pflicht), optional originaltitel + laufzeitMin (aus film.at),
   fetchImpl für Tests injizierbar. Rückgabe: alle Felder oder null bei Unklarheit.
   Serialisierung/200ms-Abstand + Cache liegen im Aufrufer (siehe App-Integration). */
export async function aufloesen(titel, opts = {}) {
  const { originaltitel = null, laufzeitMin = null, jahr = null, mitClaims = false, fetchImpl = null } = opts;
  if (!titel || !String(titel).trim()) return leerResultat();

  // 1) Kandidaten (de). Mit Originaltitel zusätzlich en -> Schnittmenge schärft.
  let ids = await suche(titel, "de", fetchImpl);
  if (originaltitel && String(originaltitel).trim() && originaltitel !== titel) {
    const en = await suche(originaltitel, "en", fetchImpl);
    const schnitt = ids.filter((id) => en.includes(id));
    ids = schnitt.length ? schnitt : [...new Set([...ids, ...en])];
  }
  if (!ids.length) return leerResultat();

  // 2) Claims ALLER Kandidaten in EINEM Request (kostet nichts extra).
  const ent = await hol(jsonUrl({ action: "wbgetentities", ids: ids.slice(0, 20).join("|"), props: "claims" }), fetchImpl);
  const entities = (ent && ent.entities) || {};
  const filme = ids.map((id) => ({ id, claims: entities[id] && entities[id].claims })).filter((e) => e.claims && istFilm(e.claims));

  // 3) Disambiguierung — kein Raten. Jahr zuerst (Master-Jahre sind verlässlich),
  //    dann Laufzeit als Rückfall (Kino-Pfad ohne Jahr).
  let treffer = null;
  if (filme.length === 1) treffer = filme[0];
  else if (filme.length > 1) {
    if (jahr) {
      const nah = filme.filter((e) => { const j = jahrAusClaims(e.claims); return j != null && Math.abs(j - jahr) <= 1; });
      if (nah.length === 1) treffer = nah[0]; // eindeutig über Jahr ±1
    }
    if (!treffer && laufzeitMin) {
      const nah = filme.filter((e) => { const l = laufzeitAusClaims(e.claims); return l != null && Math.abs(l - laufzeitMin) <= 3; });
      if (nah.length === 1) treffer = nah[0]; // eindeutig über Laufzeit ±3 min
    }
  }
  if (!treffer) return leerResultat(); // mehrdeutig / kein Film -> null

  const res = {
    jahr: jahrAusClaims(treffer.claims),
    wikidata_qid: treffer.id,
    laufzeit: laufzeitAusClaims(treffer.claims),
    regie: ersterClaimId(treffer.claims, WD.P.director),
    franchise: ersterClaimId(treffer.claims, WD.P.franchise),
    reihe: ersterClaimId(treffer.claims, WD.P.series),
  };
  if (mitClaims) res.claims = treffer.claims; // Master-Sidecar zieht ALLE Regie/Reihe/Franchise-QIDs
  return res;
}

/* Alle QIDs einer Eigenschaft (z.B. mehrere Regisseure, mehrere Reihen). */
export function alleClaimIds(claims, prop) {
  const p = (claims && claims[prop]) || [];
  return p.map((c) => c && c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value && c.mainsnak.datavalue.value.id).filter(Boolean);
}

/* QID -> Name (Label). Batcht bis 50 pro Request, de bevorzugt, en Rückfall.
   Für das Master-Sidecar: Regie/Reihe/Franchise-QIDs zu lesbaren Namen. */
export async function holeLabels(qids, opts = {}) {
  const { fetchImpl = null } = opts;
  const uniq = [...new Set((qids || []).filter(Boolean))];
  const map = {};
  for (let i = 0; i < uniq.length; i += 50) {
    const batch = uniq.slice(i, i + 50);
    try {
      const j = await hol(jsonUrl({ action: "wbgetentities", ids: batch.join("|"), props: "labels", languages: "de|en" }), fetchImpl);
      const ents = (j && j.entities) || {};
      for (const id of batch) {
        const L = ents[id] && ents[id].labels;
        const name = (L && ((L.de && L.de.value) || (L.en && L.en.value))) || null;
        if (name) map[id] = name;
      }
    } catch { /* Batch übersprungen (z.B. 429) — Labels sind best-effort, kein Absturz */ }
  }
  return map;
}
