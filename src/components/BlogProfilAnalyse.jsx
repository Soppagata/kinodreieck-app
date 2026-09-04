import { useEffect, useMemo, useRef, useState } from "react";
import {
  BLOG_PROFILE_ARTEN_SET,
  BLOG_PROFILE_RICHTUNG_SET,
  BLOG_PROFILE_SICHERHEIT_SET,
  erzeugeBlogProfilAnalyseVorschau,
  hatBlogProfileAnalyseCapability,
  isArtikelUnveraendert,
  revalidiereBlogProfilAnalyseVorschau,
  speichereBlogProfilAnalyseNachweis,
  waehleBlogProfilArtikel,
} from "../lib/blogProfilAnalyse.js";
import { uebernimmBlogProfilSignale, speichereProfil } from "../lib/profil.js";
import { uebernimmBlogVokabular } from "../lib/vokabular.js";
import { aiService, normalisiereAiErgebnis } from "../services/ai.js";
import { captureStorageContext, K, store } from "../services/storage.js";

const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PROFIL_FELDER = ["art", "wert", "richtung", "staerke", "sicherheit", "beleg"];
const VOKABULAR_FELDER = ["wort", "beschreibung", "genres", "tags", "beleg"];

const echteProfilSpeicherung = async (neuesProfil) => {
  await speichereProfil(neuesProfil);
  return true;
};

const echteVokabularSpeicherung = async (neuesVokabular) => {
  await store.set(K.vokabular, JSON.stringify(neuesVokabular));
  return true;
};

const kopie = (wert) => JSON.parse(JSON.stringify(wert));
const signatur = (wert) => {
  try { return JSON.stringify(wert); } catch { return ""; }
};
const istAktuellerContext = (context) => {
  if (!context || typeof context.isCurrent !== "function") return false;
  try { return context.isCurrent() === true; } catch { return false; }
};
const statusText = (status) => ({
  neu: "Neu",
  bereits_vorhanden: "Bereits vorhanden",
  konflikt: "Konflikt – bitte bearbeiten",
}[status] || "Ungeprüft");

const nurFelder = (item, felder) => Object.fromEntries(felder.map((feld) => [
  feld,
  Array.isArray(item?.[feld]) ? [...item[feld]] : item?.[feld],
]));

const vorschauKopf = (vorschau) => ({
  quelle: vorschau.quelle,
  articleId: vorschau.articleId,
  contentHash: vorschau.contentHash,
  analyzedAt: vorschau.analyzedAt,
  promptVersion: vorschau.promptVersion,
});

const antwortFuerGruppe = (vorschau, gruppe) => ({
  ...vorschauKopf(vorschau),
  geschmackszuege: gruppe === "profil"
    ? vorschau.geschmackszuege.map((item) => nurFelder(item, PROFIL_FELDER))
    : [],
  vokabular: gruppe === "vokabular"
    ? vorschau.vokabular.map((item) => nurFelder(item, VOKABULAR_FELDER))
    : [],
});

function sichereSessionStorage() {
  try { return globalThis.sessionStorage || null; } catch { return null; }
}

export function BlogProfilAnalyse({
  artikelListe = [],
  bekannteGenres = [],
  bekannteTags = [],
  profil = {},
  vokabular = [],
  accountId = null,
  aktiv = false,
  ai = aiService,
  markerStorage = null,
  sessionStorage: sessionStorageProp = null,
  digest,
  clock,
  captureContext = captureStorageContext,
  onProfilSpeichern = echteProfilSpeicherung,
  onVokabularSpeichern = echteVokabularSpeicherung,
  onFehler = () => {},
}) {
  const listen = useMemo(() => ({
    genres: Array.isArray(bekannteGenres) ? [...bekannteGenres] : [],
    tags: Array.isArray(bekannteTags) ? [...bekannteTags] : [],
  }), [signatur(bekannteGenres), signatur(bekannteTags)]);
  const artikelSignatur = signatur(artikelListe);
  const listenSignatur = signatur(listen);
  const geeigneteArtikel = useMemo(() => {
    if (!Array.isArray(artikelListe)) return [];
    const ids = new Set(artikelListe
      .filter((artikel) => artikel && typeof artikel.id === "string")
      .map((artikel) => artikel.id));
    return [...ids].flatMap((id) => {
      const auswahl = waehleBlogProfilArtikel({ artikel: artikelListe, artikelId: id, listen });
      return auswahl.ok ? [{ id, titel: auswahl.payload.artikel.titel, payload: auswahl.payload }] : [];
    });
  }, [artikelSignatur, listenSignatur]);

  const [artikelId, setArtikelId] = useState("");
  const [capability, setCapability] = useState(false);
  const [healthLaeuft, setHealthLaeuft] = useState(false);
  const [bestaetigt, setBestaetigt] = useState(false);
  const [analyseLaeuft, setAnalyseLaeuft] = useState(false);
  const [vorschauGeneration, setVorschauGeneration] = useState(0);
  const [unveraendert, setUnveraendert] = useState(false);
  const [vorschau, setVorschau] = useState(null);
  const [gruppenStatus, setGruppenStatus] = useState({
    profil: { laeuft: false, gespeichert: false, fehler: "", pending: null, bearbeitet: false },
    vokabular: { laeuft: false, gespeichert: false, fehler: "", pending: null, bearbeitet: false },
  });
  const [meldung, setMeldung] = useState("");

  const analyseLock = useRef(false);
  const analyseController = useRef(null);
  const healthController = useRef(null);
  const laufGeneration = useRef(0);
  const markerProbeCounter = useRef(0);
  const gruppenLocks = useRef({ profil: 0, vokabular: 0 });
  const mounted = useRef(true);
  const propsRef = useRef({});
  const marker = markerStorage || sessionStorageProp || sichereSessionStorage();
  const markerFaehig = !!marker
    && typeof marker.getItem === "function"
    && typeof marker.setItem === "function"
    && typeof marker.removeItem === "function";
  const ausgewaehlt = geeigneteArtikel.find((artikel) => artikel.id === artikelId) || null;
  const aktuellePayloadSignatur = signatur(ausgewaehlt?.payload || null);

  propsRef.current = {
    aktiv,
    accountId,
    artikelId,
    payloadSignatur: aktuellePayloadSignatur,
    profil,
    vokabular,
    capability,
    onProfilSpeichern,
    onVokabularSpeichern,
  };

  const meldeFehler = (bereich, text) => {
    const sicher = text || "Der Vorgang konnte nicht sicher abgeschlossen werden.";
    setMeldung(sicher);
    try { onFehler({ bereich, meldung: sicher }); } catch { /* UI-Fehlergrenze bleibt inhaltsfrei. */ }
  };

  const setzeGruppenStatus = (gruppe, patch) => setGruppenStatus((alt) => ({
    ...alt,
    [gruppe]: { ...alt[gruppe], ...patch },
  }));
  const hatWriterLauf = () => gruppenLocks.current.profil > 0 || gruppenLocks.current.vokabular > 0;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      analyseController.current?.abort();
      healthController.current?.abort();
    };
  }, []);

  useEffect(() => {
    const nochGueltig = geeigneteArtikel.some((artikel) => artikel.id === artikelId);
    if (!nochGueltig) setArtikelId(geeigneteArtikel[0]?.id || "");
  }, [artikelSignatur, listenSignatur, artikelId]);

  useEffect(() => {
    analyseController.current?.abort();
    analyseLock.current = false;
    setAnalyseLaeuft(false);
    setBestaetigt(false);
    setUnveraendert(false);
    setVorschauGeneration(0);
    setMeldung("");
    setVorschau(null);
    setGruppenStatus({
      profil: { laeuft: false, gespeichert: false, fehler: "", pending: null, bearbeitet: false },
      vokabular: { laeuft: false, gespeichert: false, fehler: "", pending: null, bearbeitet: false },
    });
  }, [aktiv, accountId, artikelId, aktuellePayloadSignatur]);

  useEffect(() => {
    healthController.current?.abort();
    setCapability(false);
    if (!aktiv || !ACCOUNT_ID.test(String(accountId || "")) || typeof ai?.runTask !== "function") {
      setHealthLaeuft(false);
      return undefined;
    }

    const controller = new AbortController();
    healthController.current = controller;
    const konto = accountId;
    let context;
    try { context = captureContext(); } catch { context = null; }
    setHealthLaeuft(true);

    Promise.resolve(ai.runTask("health", {}, { signal: controller.signal }))
      .then((antwort) => {
        if (!mounted.current || controller.signal.aborted) return;
        if (propsRef.current.accountId !== konto || !propsRef.current.aktiv || !istAktuellerContext(context)) return;
        setCapability(hatBlogProfileAnalyseCapability(antwort));
      })
      .catch(() => {
        if (mounted.current && !controller.signal.aborted) setCapability(false);
      })
      .finally(() => {
        if (mounted.current && healthController.current === controller) setHealthLaeuft(false);
      });

    return () => controller.abort();
  }, [aktiv, accountId, ai, captureContext]);

  useEffect(() => {
    if (!capability) analyseController.current?.abort();
  }, [capability]);

  useEffect(() => {
    let verworfen = false;
    setUnveraendert(false);
    if (!aktiv || !ACCOUNT_ID.test(String(accountId || "")) || !ausgewaehlt || !markerFaehig) return undefined;
    let context;
    try { context = captureContext(); } catch { return undefined; }
    const konto = accountId;
    const payloadSig = aktuellePayloadSignatur;
    isArtikelUnveraendert(marker, konto, ausgewaehlt.payload, { digest })
      .then((wert) => {
        if (verworfen || !mounted.current || !istAktuellerContext(context)) return;
        if (propsRef.current.accountId !== konto || propsRef.current.payloadSignatur !== payloadSig) return;
        setUnveraendert(wert === true);
      })
      .catch(() => {});
    return () => { verworfen = true; };
  }, [aktiv, accountId, artikelId, aktuellePayloadSignatur, marker, markerFaehig, digest, captureContext]);

  const pruefeFence = (start, context) => mounted.current
    && propsRef.current.aktiv
    && propsRef.current.capability
    && propsRef.current.accountId === start.accountId
    && propsRef.current.artikelId === start.artikelId
    && propsRef.current.payloadSignatur === start.payloadSignatur
    && Number(start.vorschauGeneration) > 0
    && laufGeneration.current === start.vorschauGeneration
    && istAktuellerContext(context);

  const pruefeMarkerProbe = (start) => {
    const probeId = ++markerProbeCounter.current;
    const probeKey = `kd-blogprofilanalyse-marker-probe:${start.accountId}:${start.vorschauGeneration}:${probeId}`;
    const probeKontrolle = `kd-blogprofilanalyse-marker-probe-preflight:${start.accountId}:${start.vorschauGeneration}:${probeId}`;
    const probeWert = `probe-${Date.now()}-${markerProbeCounter.current}`;
    let vorher = null;
    let hatVorher = false;
    try {
      marker.removeItem(probeKontrolle);
      vorher = marker.getItem(probeKey);
      hatVorher = vorher !== null;
      marker.setItem(probeKey, probeWert);
      if (marker.getItem(probeKey) !== probeWert) throw new Error("probe-readback");
      if (hatVorher) {
        marker.setItem(probeKey, vorher);
      } else {
        marker.removeItem(probeKey);
      }
      return true;
    } catch {
      try {
        if (hatVorher) {
          marker.setItem(probeKey, vorher);
        } else {
          marker.removeItem(probeKey);
        }
      } catch {}
      return false;
    } finally {
      try { marker.removeItem(probeKontrolle); } catch {}
    }
  };

  const analysieren = async () => {
    if (analyseLock.current || analyseLaeuft || hatWriterLauf() || gruppenStatus.profil.laeuft || gruppenStatus.vokabular.laeuft
      || !capability || !bestaetigt || !ausgewaehlt || !markerFaehig) return;
    analyseLock.current = true;
    const controller = new AbortController();
    analyseController.current = controller;
    const payload = kopie(ausgewaehlt.payload);
    const start = {
      accountId,
      artikelId,
      payloadSignatur: signatur(payload),
      vorschauGeneration: laufGeneration.current + 1,
    };
    laufGeneration.current = start.vorschauGeneration;
    let context;
    try { context = captureContext(); } catch { context = null; }
    if (!istAktuellerContext(context)) {
      analyseLock.current = false;
      meldeFehler("analyse", "Die Analyse konnte nicht sicher gestartet werden.");
      return;
    }
    if (!pruefeFence(start, context)) {
      analyseLock.current = false;
      return;
    }

    setAnalyseLaeuft(true);
    setMeldung("");
    if (!pruefeMarkerProbe(start)) {
      analyseLock.current = false;
      setAnalyseLaeuft(false);
      meldeFehler("analyse", "Der sichere Analysenachweis konnte nicht geprüft werden.");
      return;
    }
    const contextWaechter = setInterval(() => {
      if (!pruefeFence(start, context)) controller.abort();
    }, 25);

    try {
      const response = normalisiereAiErgebnis(
        "blog-profile-extract",
        await ai.runTask("blog-profile-extract", payload, { signal: controller.signal }),
      );
      if (controller.signal.aborted || !pruefeFence(start, context)) return;
      if (response?.responseMode === "degraded") {
        /* Bereinigter Providertext bleibt ein sichtbarer Hinweis, niemals ein
           Profilkandidat. Auch eine ältere Vorschau muss hier verschwinden,
           damit sie nicht wie das Ergebnis dieses Laufs bestätigt wird. */
        setVorschau(null);
        setVorschauGeneration(0);
        setBestaetigt(false);
        setGruppenStatus({
          profil: { laeuft: false, gespeichert: false, fehler: "", pending: null, bearbeitet: false },
          vokabular: { laeuft: false, gespeichert: false, fehler: "", pending: null, bearbeitet: false },
        });
        setMeldung(response.displayText);
        return;
      }
      const ergebnis = await erzeugeBlogProfilAnalyseVorschau({
        artikelPayload: payload,
        modelAntwort: response?.data,
        bestehendesProfil: propsRef.current.profil,
        bestehendesVokabular: propsRef.current.vokabular,
        storage: marker,
        accountId: start.accountId,
        digest,
        clock,
      });
      if (controller.signal.aborted || !pruefeFence(start, context)) return;
      if (!ergebnis.ok) {
        meldeFehler("analyse", "Die KI-Antwort entsprach nicht dem sicheren Analyseformat.");
        return;
      }
      const nachweis = {
        articleId: ergebnis.payload.articleId,
        contentHash: ergebnis.payload.contentHash,
        analyzedAt: ergebnis.payload.analyzedAt,
      };
      if (!speichereBlogProfilAnalyseNachweis(marker, start.accountId, nachweis)) {
        meldeFehler("analyse", "Der lokale Analysenachweis konnte nicht gespeichert werden.");
        return;
      }
      if (!pruefeFence(start, context)) return;
      setVorschau(ergebnis.payload);
      setVorschauGeneration(start.vorschauGeneration);
      setUnveraendert(true);
      setBestaetigt(false);
      setMeldung(response?.responseMode === "partial" ? response.displayText : "");
      setGruppenStatus({
        profil: { laeuft: false, gespeichert: false, fehler: "", pending: null, bearbeitet: false },
        vokabular: { laeuft: false, gespeichert: false, fehler: "", pending: null, bearbeitet: false },
      });
    } catch {
      if (!controller.signal.aborted && pruefeFence(start, context)) {
        meldeFehler("analyse", "Die Analyse konnte nicht abgeschlossen werden.");
      }
    } finally {
      clearInterval(contextWaechter);
      if (analyseController.current === controller) analyseController.current = null;
      analyseLock.current = false;
      if (mounted.current) setAnalyseLaeuft(false);
    }
  };

  const analyseAbbrechen = () => {
    if (!analyseLock.current || !analyseController.current) return;
    analyseController.current.abort();
    setMeldung("Die Analyse wurde abgebrochen. Es wurde kein Ergebnis übernommen.");
  };

  const aktualisiereKandidat = (gruppe, index, feld, wert) => {
    if (!vorschau || gruppenStatus[gruppe].gespeichert) return;
    const listenFeld = gruppe === "profil" ? "geschmackszuege" : "vokabular";
    setVorschau((alt) => ({
      ...alt,
      [listenFeld]: alt[listenFeld].map((item, i) => i === index ? { ...item, [feld]: wert } : item),
    }));
    setzeGruppenStatus(gruppe, { bearbeitet: true, fehler: "", pending: null });
  };

  const persistiere = async (gruppe, pending, wert, context) => {
    const writer = gruppe === "profil" ? propsRef.current.onProfilSpeichern : propsRef.current.onVokabularSpeichern;
    if (!pruefeFence(pending, context)) return;
    const start = {
      accountId: pending.accountId,
      artikelId: pending.artikelId,
      payloadSignatur: pending.payloadSignatur,
      vorschauGeneration: pending.vorschauGeneration,
    };
    try {
      const bestaetigung = await writer(wert);
      if (bestaetigung == null || bestaetigung === false) throw new Error("nicht bestätigt");
      if (!pruefeFence(start, context)) return;
      setzeGruppenStatus(gruppe, { laeuft: false, gespeichert: true, fehler: "", pending: null });
    } catch {
      if (mounted.current && pruefeFence(start, context)) {
        setzeGruppenStatus(gruppe, {
          laeuft: false,
          fehler: gruppe === "profil"
            ? "Das Geschmacksprofil wurde nicht gespeichert. Die Vorschau bleibt erhalten."
            : "Das Vokabular wurde nicht gespeichert. Die Vorschau bleibt erhalten.",
          pending,
        });
      }
    } finally {
      if (gruppenLocks.current[gruppe] === start.vorschauGeneration) {
        gruppenLocks.current[gruppe] = 0;
      }
      if (mounted.current) {
        setzeGruppenStatus(gruppe, { laeuft: false });
      }
    }
  };

  const bereiteGruppenWert = async (gruppe, start, context) => {
    const payload = kopie(ausgewaehlt?.payload || null);
    if (!payload || !context || !pruefeFence(start, context)) {
      return { ok: false, grund: "Kontext" };
    }
    try {
      const revalidiert = await revalidiereBlogProfilAnalyseVorschau({
        artikelPayload: payload,
        modelAntwort: antwortFuerGruppe(vorschau, gruppe),
        bestehendesProfil: propsRef.current.profil,
        bestehendesVokabular: propsRef.current.vokabular,
        storage: marker,
        accountId,
        digest,
        clock,
      });
      if (!pruefeFence(start, context)) return { ok: false, grund: "Kontext" };
      if (!revalidiert.ok) return { ok: false, grund: "Validierung" };
      const kandidaten = gruppe === "profil"
        ? revalidiert.payload.geschmackszuege
        : revalidiert.payload.vokabular;
      if (kandidaten.some((item) => item.status === "konflikt")) {
        return { ok: false, grund: "Konflikt" };
      }
      const kopf = vorschauKopf(revalidiert.payload);
      const uebernahme = gruppe === "profil"
        ? uebernimmBlogProfilSignale(propsRef.current.profil, kopf, kandidaten.map((item) => nurFelder(item, PROFIL_FELDER)))
        : uebernimmBlogVokabular(propsRef.current.vokabular, kopf, kandidaten.map((item) => nurFelder(item, VOKABULAR_FELDER)));
      if (uebernahme?.abgelehnt || (Array.isArray(uebernahme?.fehler) && uebernahme.fehler.length)) {
        return { ok: false, grund: "Übernahme" };
      }
      const wert = gruppe === "profil" ? uebernahme?.profil : uebernahme?.vokabular;
      if (wert == null) return { ok: false, grund: "Übernahme" };
      const basis = gruppe === "profil" ? propsRef.current.profil : propsRef.current.vokabular;
      return { ok: true, wert, basisSignatur: signatur(basis) };
    } catch {
      return { ok: false, grund: "Validierung" };
    }
  };

  const speichereGruppe = async (gruppe) => {
    if (!vorschau || gruppenLocks.current[gruppe] || gruppenStatus[gruppe].gespeichert) return;
    if (vorschau[gruppe === "profil" ? "geschmackszuege" : "vokabular"].some((item) => item.status === "konflikt")
      && !gruppenStatus[gruppe].bearbeitet) return;
    const payload = kopie(ausgewaehlt?.payload || null);
    const start = { accountId, artikelId, payloadSignatur: signatur(payload), vorschauGeneration: vorschauGeneration };
    let context;
    try { context = captureContext(); } catch { context = null; }
    if (!pruefeFence(start, context)) return;
    setzeGruppenStatus(gruppe, { laeuft: true, fehler: "" });
    gruppenLocks.current[gruppe] = start.vorschauGeneration;
    try {
      const vorbereitet = await bereiteGruppenWert(gruppe, start, context);
      if (!vorbereitet.ok) {
        if (gruppenLocks.current[gruppe] === start.vorschauGeneration) {
          gruppenLocks.current[gruppe] = 0;
        }
        setzeGruppenStatus(gruppe, {
          laeuft: false,
          fehler: vorbereitet.grund === "Konflikt"
            ? "In dieser Gruppe besteht noch ein Konflikt. Bitte bearbeite den markierten Kandidaten."
            : "Diese Gruppe konnte nicht sicher gespeichert werden. Die Vorschau bleibt erhalten.",
        });
        return;
      }
      const pending = { ...start, basisSignatur: vorbereitet.basisSignatur };
      setzeGruppenStatus(gruppe, { pending });
      await persistiere(gruppe, pending, vorbereitet.wert, context);
    } catch {
      if (mounted.current && (!context || pruefeFence(start, context))) {
        setzeGruppenStatus(gruppe, {
          laeuft: false,
          fehler: "Diese Gruppe konnte nicht sicher gespeichert werden. Die Vorschau bleibt erhalten.",
        });
      }
    } finally {
      if (gruppenLocks.current[gruppe] === start.vorschauGeneration) {
        gruppenLocks.current[gruppe] = 0;
      }
      if (mounted.current) {
        setzeGruppenStatus(gruppe, { laeuft: false });
      }
    }
  };

  const retryGruppe = async (gruppe) => {
    const pending = gruppenStatus[gruppe].pending;
    if (!pending || gruppenLocks.current[gruppe] || gruppenStatus[gruppe].gespeichert) return;
    let context;
    try { context = captureContext(); } catch { context = null; }
    if (!context || !pruefeFence(pending, context)) return;
    const start = {
      ...pending,
      vorschauGeneration: pending.vorschauGeneration,
    };
    if (!pruefeFence(start, context)) return;
    gruppenLocks.current[gruppe] = start.vorschauGeneration;
    setzeGruppenStatus(gruppe, { laeuft: true, fehler: "" });
    try {
      const aktuelleBasis = gruppe === "profil" ? propsRef.current.profil : propsRef.current.vokabular;
      if (signatur(aktuelleBasis) !== pending.basisSignatur) {
        if (gruppenLocks.current[gruppe] === start.vorschauGeneration) {
          gruppenLocks.current[gruppe] = 0;
        }
        setzeGruppenStatus(gruppe, {
          laeuft: false,
          pending: null,
          fehler: "Der lokale Datenstand hat sich geändert. Bitte prüfe die Vorschau und speichere diese Gruppe neu.",
        });
        return;
      }
      const vorbereitet = await bereiteGruppenWert(gruppe, pending, context);
      if (!vorbereitet.ok || vorbereitet.basisSignatur !== pending.basisSignatur) {
        if (gruppenLocks.current[gruppe] === start.vorschauGeneration) {
          gruppenLocks.current[gruppe] = 0;
        }
        setzeGruppenStatus(gruppe, {
          laeuft: false,
          pending: null,
          fehler: "Die Vorschau konnte nicht mehr sicher gegen den aktuellen Datenstand geprüft werden. Bitte speichere die Gruppe neu.",
        });
        return;
      }
      await persistiere(gruppe, pending, vorbereitet.wert, context);
    }
    finally {
      if (gruppenLocks.current[gruppe] === start.vorschauGeneration) {
        gruppenLocks.current[gruppe] = 0;
      }
      if (mounted.current) {
        setzeGruppenStatus(gruppe, { laeuft: false });
      }
    }
  };

  const beideGespeichert = gruppenStatus.profil.gespeichert && gruppenStatus.vokabular.gespeichert;
  const profilGesperrt = gruppenStatus.profil.laeuft || gruppenStatus.profil.gespeichert;
  const vokabularGesperrt = gruppenStatus.vokabular.laeuft || gruppenStatus.vokabular.gespeichert;
  const writerLaeuft = hatWriterLauf();
  const analyseGesperrt = analyseLaeuft || writerLaeuft;

  return <section className="kd-blogprofilanalyse" aria-labelledby="blogprofilanalyse-titel">
    <h3 id="blogprofilanalyse-titel">Eigene Blogartikel für dein Profil auswerten</h3>
    <p>Wähle ausschließlich einen eigenen Artikel. Du prüfst und bearbeitest jeden Vorschlag, bevor lokal gespeichert wird.</p>

    <label htmlFor="blogprofilanalyse-artikel">Eigener Artikel</label>
    <select id="blogprofilanalyse-artikel" value={artikelId} disabled={analyseGesperrt}
      onChange={(event) => setArtikelId(event.target.value)}>
      {geeigneteArtikel.length === 0 && <option value="">Kein geeigneter eigener Artikel</option>}
      {geeigneteArtikel.map((artikel) => <option key={artikel.id} value={artikel.id}>{artikel.titel}</option>)}
    </select>

    {unveraendert && <p role="status">Dieser unveränderte Artikel wurde bereits analysiert. Eine neue Analyse startet nur durch einen weiteren ausdrücklichen Klick.</p>}
    {aktiv && ACCOUNT_ID.test(String(accountId || "")) && healthLaeuft && <p role="status">Sichere KI-Fähigkeit wird geprüft …</p>}
    {aktiv && ACCOUNT_ID.test(String(accountId || "")) && !healthLaeuft && !capability
      && <p>Die Bloganalyse ist für dieses Konto derzeit nicht sicher freigegeben.</p>}

    {analyseGesperrt && <p role="status">Ein Gruppen-Speicherlauf oder laufender KI-Auftrag verhindert neue Analyse-Aktionen.</p>}

    {capability && ausgewaehlt && !markerFaehig
      && <p>Die Bloganalyse bleibt gesperrt, weil kein sicherer lokaler Analysenachweis gespeichert werden kann.</p>}
      {capability && ausgewaehlt && markerFaehig && <fieldset>
        <legend>Kostenpflichtigen Auftrag bestätigen</legend>
        <p><strong>Einmalig an den KI-Anbieter gesendet:</strong> Titel, vollständiger Artikeltext, vollständige Genre- und Tag-Listen.</p>
        <p className="kd-blogprofilanalyse-consent-felder">
        Titel: {ausgewaehlt?.payload?.artikel?.titel}; Artikeltext: {ausgewaehlt?.payload?.artikel?.text}; Genres: {JSON.stringify(ausgewaehlt?.payload?.listen?.genres)}; Tags: {JSON.stringify(ausgewaehlt?.payload?.listen?.tags)}
      </p>
      <label className="kd-touch-checkbox" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={bestaetigt} disabled={analyseGesperrt}
          onChange={(event) => setBestaetigt(event.target.checked)} />
        Ich möchte diesen ausgewählten eigenen Artikel jetzt einmal analysieren lassen.
      </label>
      <button type="button" disabled={!bestaetigt || analyseGesperrt} onClick={analysieren}>
        {analyseLaeuft ? "Artikel wird einmalig analysiert …" : unveraendert ? "Artikel ausdrücklich erneut analysieren" : "Artikel einmalig analysieren"}
      </button>
      {analyseLaeuft && <button type="button" onClick={analyseAbbrechen}>Laufende Analyse abbrechen</button>}
    </fieldset>}

    <div aria-live="polite">{meldung}</div>

    {vorschau && <div className="kd-blogprofilanalyse-vorschau">
      <h4>Vorschau – noch nicht gespeichert</h4>
      <section aria-labelledby="blogprofilanalyse-profil">
        <h5 id="blogprofilanalyse-profil">Geschmackszüge</h5>
        {vorschau.geschmackszuege.map((item, index) => <fieldset key={`profil-${index}`} data-status={item.status}>
          <legend>Kandidat {index + 1}: {statusText(item.status)}</legend>
          <label>Art
            <select aria-label={`Art Geschmackszug ${index + 1}`} value={item.art} disabled={profilGesperrt}
              onChange={(event) => aktualisiereKandidat("profil", index, "art", event.target.value)}>
              {BLOG_PROFILE_ARTEN_SET.map((wert) => <option key={wert} value={wert}>{wert}</option>)}
            </select>
          </label>
          <label>Wert
            {item.art === "genre"
              ? <select aria-label={`Wert Geschmackszug ${index + 1}`} value={item.wert} disabled={profilGesperrt}
                onChange={(event) => aktualisiereKandidat("profil", index, "wert", event.target.value)}>
                {!bekannteGenres.includes(item.wert) && <option value={item.wert}>{item.wert}</option>}
                {bekannteGenres.map((wert) => <option key={wert} value={wert}>{wert}</option>)}
              </select>
              : <input aria-label={`Wert Geschmackszug ${index + 1}`} value={item.wert} disabled={profilGesperrt}
                onChange={(event) => aktualisiereKandidat("profil", index, "wert", event.target.value)} />}
          </label>
          <label>Richtung
            <select aria-label={`Richtung Geschmackszug ${index + 1}`} value={item.richtung} disabled={profilGesperrt}
              onChange={(event) => aktualisiereKandidat("profil", index, "richtung", event.target.value)}>
              {BLOG_PROFILE_RICHTUNG_SET.map((wert) => <option key={wert} value={wert}>{wert}</option>)}
            </select>
          </label>
          <label>Stärke
            <input aria-label={`Stärke Geschmackszug ${index + 1}`} type="number" min="1" max="5" step="1" value={item.staerke}
              disabled={profilGesperrt}
              onChange={(event) => aktualisiereKandidat("profil", index, "staerke", Number(event.target.value))} />
          </label>
          <label>Sicherheit
            <select aria-label={`Sicherheit Geschmackszug ${index + 1}`} value={item.sicherheit} disabled={profilGesperrt}
              onChange={(event) => aktualisiereKandidat("profil", index, "sicherheit", event.target.value)}>
              {BLOG_PROFILE_SICHERHEIT_SET.map((wert) => <option key={wert} value={wert}>{wert}</option>)}
            </select>
          </label>
          <label>Beleg
            <input aria-label={`Beleg Geschmackszug ${index + 1}`} value={item.beleg} disabled={profilGesperrt}
              onChange={(event) => aktualisiereKandidat("profil", index, "beleg", event.target.value)} />
          </label>
        </fieldset>)}
        <button type="button" disabled={gruppenStatus.profil.laeuft || gruppenStatus.profil.gespeichert
          || (vorschau.geschmackszuege.some((item) => item.status === "konflikt") && !gruppenStatus.profil.bearbeitet)}
          onClick={() => speichereGruppe("profil")}>
          {gruppenStatus.profil.gespeichert ? "Geschmacksprofil gespeichert" : gruppenStatus.profil.laeuft ? "Geschmacksprofil wird gespeichert …" : "Geschmacksprofil speichern"}
        </button>
        {gruppenStatus.profil.laeuft && <p role="status">Laufender Schreiblauf Geschmacksprofil.</p>}
        {gruppenStatus.profil.fehler && <p role="alert">{gruppenStatus.profil.fehler}</p>}
        {gruppenStatus.profil.pending && !gruppenStatus.profil.gespeichert
          && <button type="button" disabled={gruppenStatus.profil.laeuft} onClick={() => retryGruppe("profil")}>Geschmacksprofil lokal erneut speichern</button>}
      </section>

      <section aria-labelledby="blogprofilanalyse-vokabular">
        <h5 id="blogprofilanalyse-vokabular">Vokabular</h5>
        {vorschau.vokabular.map((item, index) => <fieldset key={`vokabular-${index}`} data-status={item.status}>
          <legend>Kandidat {index + 1}: {statusText(item.status)}</legend>
          <label>Wort
            <input aria-label={`Wort Vokabular ${index + 1}`} value={item.wort} disabled={vokabularGesperrt}
              onChange={(event) => aktualisiereKandidat("vokabular", index, "wort", event.target.value)} />
          </label>
          <label>Beschreibung
            <input aria-label={`Beschreibung Vokabular ${index + 1}`} value={item.beschreibung} disabled={vokabularGesperrt}
              onChange={(event) => aktualisiereKandidat("vokabular", index, "beschreibung", event.target.value)} />
          </label>
          <label>Genres
            <select aria-label={`Genres Vokabular ${index + 1}`} multiple value={item.genres} disabled={vokabularGesperrt}
              onChange={(event) => aktualisiereKandidat("vokabular", index, "genres", [...event.target.selectedOptions].map((option) => option.value))}>
              {bekannteGenres.map((wert) => <option key={wert} value={wert}>{wert}</option>)}
            </select>
          </label>
          <label>Tags
            <select aria-label={`Tags Vokabular ${index + 1}`} multiple value={item.tags} disabled={vokabularGesperrt}
              onChange={(event) => aktualisiereKandidat("vokabular", index, "tags", [...event.target.selectedOptions].map((option) => option.value))}>
              {bekannteTags.map((wert) => <option key={wert} value={wert}>{wert}</option>)}
            </select>
          </label>
          <label>Beleg
            <input aria-label={`Beleg Vokabular ${index + 1}`} value={item.beleg} disabled={vokabularGesperrt}
              onChange={(event) => aktualisiereKandidat("vokabular", index, "beleg", event.target.value)} />
          </label>
        </fieldset>)}
        <button type="button" disabled={gruppenStatus.vokabular.laeuft || gruppenStatus.vokabular.gespeichert
          || (vorschau.vokabular.some((item) => item.status === "konflikt") && !gruppenStatus.vokabular.bearbeitet)}
          onClick={() => speichereGruppe("vokabular")}>
          {gruppenStatus.vokabular.gespeichert ? "Vokabular gespeichert" : gruppenStatus.vokabular.laeuft ? "Vokabular wird gespeichert …" : "Vokabular speichern"}
        </button>
        {gruppenStatus.vokabular.laeuft && <p role="status">Laufender Schreiblauf Vokabular.</p>}
        {gruppenStatus.vokabular.fehler && <p role="alert">{gruppenStatus.vokabular.fehler}</p>}
        {gruppenStatus.vokabular.pending && !gruppenStatus.vokabular.gespeichert
          && <button type="button" disabled={gruppenStatus.vokabular.laeuft} onClick={() => retryGruppe("vokabular")}>Vokabular lokal erneut speichern</button>}
      </section>

      {beideGespeichert && <div role="status">
        Beide Gruppen wurden gespeichert.
        <button type="button" onClick={() => setVorschau(null)}>Analyse schließen</button>
      </div>}
    </div>}
  </section>;
}

export default BlogProfilAnalyse;
