/* ---------- Auth-Treiber (Etappe 3) ----------
   Anmeldung gegen Supabase Auth (GoTrue) über die REST-Schnittstelle — bewusst
   ohne `@supabase/supabase-js`: die App hat keine Runtime-Dependency außer React,
   und der Single-File-Build verträgt keine dynamischen Importe.

   Modell:
   - Anmeldung mit BENUTZERNAME + Passwort. GoTrue verlangt ein E-Mail-Format,
     also wird intern eine synthetische Adresse gebildet (<name>@login.<domain>).
     Es wird nie eine Mail versendet; die Domain hat keinen MX-Eintrag.
   - Tokens liegen ATOMAR in EINEM localStorage-Schlüssel (kd:auth:session), damit
     ein Absturz mitten im Refresh nie eine halbe Session hinterlässt.
   - Tokens verlassen diesen Treiber nie in Richtung UI. Der Session-Snapshot der
     Auth-Grenze ist tokenfrei (Zusage aus Etappe 1).
   - Refresh ist RESUME-getrieben (Start + Sichtbarwerden) und on-401 — kein Timer:
     iOS suspendiert Timer in der installierten PWA, nur der Server ist die Wahrheit.
   - Fehler-Taxonomie (bindend): NUR ein eindeutiges "Refresh-Token ungültig"
     (400/401 mit invalid_grant) verwirft die Sitzung. Netzwerkfehler, Timeouts und
     5xx (z. B. pausiertes Free-Projekt) behalten sie und melden "degraded" —
     sonst würde ein Serverausfall Nutzer stillschweigend ausloggen.

   Kein LLM, kein service_role, keine Analyse von Anmeldeverhalten. */

import { istSupabaseProjektUrl } from "./supabasePublic.js";
import { ACCOUNT_ACCESS_STATUS, loadOwnAccountAccess } from "./accountAccess.js";
import { BoundaryError, ERROR_CODES, normalizeBoundaryError } from "../services/errors.js";

export const AUTH_SESSION_KEY = "kd:auth:session";
export const STANDARD_MAIL_DOMAIN = "login.kinodreieck.at";
const SESSION_SCHEMA = 1;
const REFRESH_PUFFER_MS = 5 * 60 * 1000;   // so früh vor Ablauf proaktiv erneuern
const TIMEOUT_MS = 10000;

const nichtLeer = (wert) => typeof wert === "string" && wert.trim().length > 0;
const istMail = (wert) => nichtLeer(wert) && /^[^\s@]+@[^\s@]+$/.test(wert.trim());

function istVollstaendigeGespeicherteSitzung(s) {
  return !!s && s.v === SESSION_SCHEMA
    && nichtLeer(s.access_token) && nichtLeer(s.refresh_token)
    && nichtLeer(s.kontoId) && istMail(s.mail)
    && Number.isFinite(s.gueltigBis) && s.gueltigBis > 0;
}

/* Zustände, die der Treiber nach außen meldet. */
export const AUTH_ZUSTAND = Object.freeze({
  GAST: "gast",             // keine Sitzung vorhanden
  ANGEMELDET: "angemeldet", // gültiges Token
  DEGRADIERT: "degradiert", // Sitzung da, Server gerade nicht erreichbar
  ABGELAUFEN: "abgelaufen",  // Server hat die Sitzung endgültig verworfen
});

/* ---------- Benutzername ↔ synthetische Adresse ---------- */
export function normalisiereBenutzername(wert) {
  return String(wert == null ? "" : wert).trim().toLowerCase().replace(/\s+/g, "");
}
export function benutzernameZuMail(benutzername, domain = STANDARD_MAIL_DOMAIN) {
  const name = normalisiereBenutzername(benutzername);
  if (!name) return "";
  if (name.includes("@")) return name;          // vollqualifiziert übernommen
  return name + "@" + domain;
}
export function mailZuBenutzername(mail) {
  const wert = String(mail == null ? "" : mail).trim();
  const at = wert.indexOf("@");
  return at > 0 ? wert.slice(0, at) : wert;
}

/* ---------- Sitzungsablage (ein Schlüssel, ein Schreibvorgang) ---------- */
function leseSitzung() {
  try {
    const roh = localStorage.getItem(AUTH_SESSION_KEY);
    if (!roh) return null;
    const s = JSON.parse(roh);
    if (!istVollstaendigeGespeicherteSitzung(s)) return null;
    return {
      ...s,
      mail: s.mail.trim(),
      benutzername: nichtLeer(s.benutzername) ? s.benutzername : mailZuBenutzername(s.mail),
    };
  } catch { return null; }
}
function schreibeSitzung(s) {
  if (!istVollstaendigeGespeicherteSitzung(s)) return false;
  try {
    const raw = JSON.stringify(s);
    localStorage.setItem(AUTH_SESSION_KEY, raw);
    return localStorage.getItem(AUTH_SESSION_KEY) === raw;
  }
  catch { return false; }
}
function loescheSitzung() {
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
    return localStorage.getItem(AUTH_SESSION_KEY) == null;
  } catch { return false; }
}
export function hatGespeicherteSitzung() { return !!leseSitzung(); }

/* Login-Lebensdauer und Tokenrotation sind unterschiedliche Identitäten.
   Alte schema-1-Sitzungen bleiben lesbar; jeder neue Login bekommt eine ID. */
function gleicheAnmeldung(a, b) {
  return !!a && !!b && a.kontoId === b.kontoId
    && a.mail === b.mail
    && (a.sitzungsId || null) === (b.sitzungsId || null);
}
function gleicheVersion(a, b) {
  return gleicheAnmeldung(a, b) && a.access_token === b.access_token
    && a.refresh_token === b.refresh_token;
}
function neueSitzungsId() {
  return globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random()}-${Math.random()}`;
}

/* Nur synchrone Credential-Commits laufen in dieser Transaktion, niemals HTTP
   oder die asynchrone Cache-Trennung. Der leere Store enthält keine Nutzdaten.
   Auch Web-Lock-Tabs nutzen ihn, damit ein Tab ohne Web Locks denselben Mutex
   teilt. Eine fehlgeschlagene Primitive wird nicht ungesperrt umgangen. */
function mitIndexedDbCommit(auftrag) {
  return new Promise((resolve, reject) => {
    let db, tx, beendet = false;
    const ende = (error, wert) => {
      if (beendet) return;
      beendet = true;
      clearTimeout(timer);
      db?.close();
      if (error) reject(error); else resolve(wert);
    };
    const timer = setTimeout(() => {
      try { tx?.abort(); } catch { /* bereits beendet */ }
      ende(new Error("Auth-Commit-Sperre nicht erreichbar."));
    }, TIMEOUT_MS);
    let open;
    try { open = globalThis.indexedDB.open("kd-auth-commit", 1); }
    catch (error) { ende(error); return; }
    open.onupgradeneeded = () => open.result.createObjectStore("mutex");
    open.onerror = () => ende(open.error);
    open.onblocked = () => ende(new Error("Auth-Commit-Sperre blockiert."));
    open.onsuccess = () => {
      db = open.result;
      if (beendet) { db.close(); return; }
      db.onversionchange = () => db.close();
      let wert;
      try {
        tx = db.transaction("mutex", "readwrite");
        tx.onabort = () => ende(tx.error || new Error("Auth-Commit abgebrochen."));
        tx.onerror = () => ende(tx.error || new Error("Auth-Commit fehlgeschlagen."));
        tx.oncomplete = () => ende(null, wert);
        /* Erst das Request-Event besitzt die aktive, tabweit exklusive
           Transaktion; transaction() allein hat den Mutex noch nicht. */
        tx.objectStore("mutex").get("commit").onsuccess = () => {
          if (beendet) return;
          try { wert = auftrag(); }
          catch (error) { try { tx.abort(); } catch { /* beendet */ } ende(error); }
        };
      } catch (error) { ende(error); }
    };
  });
}

/* Außerhalb des Browsers gibt es keinen tabgeteilten Storage. Diese Queue
   serialisiert dort die Treiber desselben Prozesses (u. a. lokale Mocktests). */
let prozessCommit = Promise.resolve();
function mitProzessCommit(auftrag) {
  const lauf = prozessCommit.catch(() => {}).then(auftrag);
  prozessCommit = lauf.catch(() => {});
  return lauf;
}

/* `jetztMs` kommt immer von der Uhr des Treibers — nie direkt von Date.now().
   Sonst liefen Ablaufrechnung und Ablaufprüfung auf zwei verschiedenen Uhren. */
function sitzungAus(daten, {
  jetztMs = Date.now(), erwarteteKontoId = null, erwarteteMail = null,
} = {}) {
  if (!daten || typeof daten !== "object" || Array.isArray(daten)
      || !nichtLeer(daten.access_token) || !nichtLeer(daten.refresh_token)
      || !nichtLeer(daten.user?.id) || !istMail(daten.user?.email)) return null;
  const hatExpiresAt = Object.prototype.hasOwnProperty.call(daten, "expires_at");
  const gueltigBis = hatExpiresAt
    ? (Number.isFinite(daten.expires_at) ? daten.expires_at * 1000 : NaN)
    : (Number.isFinite(daten.expires_in) && daten.expires_in > 0
      ? jetztMs + daten.expires_in * 1000
      : NaN);
  if (!Number.isFinite(gueltigBis) || gueltigBis <= jetztMs) return null;
  const kontoId = daten.user.id.trim();
  const mail = daten.user.email.trim();
  if (erwarteteKontoId != null && kontoId !== String(erwarteteKontoId).trim()) return null;
  if (erwarteteMail != null && mail.toLowerCase() !== String(erwarteteMail).trim().toLowerCase()) return null;
  return {
    v: SESSION_SCHEMA,
    access_token: daten.access_token,
    refresh_token: daten.refresh_token,
    gueltigBis,
    kontoId,
    mail,
    benutzername: mailZuBenutzername(mail),
  };
}

function unvollstaendigeSitzungsantwort(operation) {
  return new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
    source: "auth", operation, reason: "incomplete-session-contract",
    message: "Die Anmeldung konnte nicht sicher bestätigt werden. Bitte versuche es erneut.",
  });
}

/* ---------- Treiber ---------- */
export function createAuthDriver({
  config = {},
  fetchImpl = null,
  mailDomain = STANDARD_MAIL_DOMAIN,
  jetzt = () => Date.now(),
  locks = null,
} = {}) {
  const basis = String(config.supabaseUrl || "").trim().replace(/\/+$/, "");
  const anon = String(config.supabasePublishableKey || "").trim();
  let zustand = leseSitzung() ? AUTH_ZUSTAND.ANGEMELDET : AUTH_ZUSTAND.GAST;
  let refreshLaeuft = null;

  function commit(auftrag) {
    const lokal = () => {
      if (globalThis.indexedDB) return mitIndexedDbCommit(auftrag);
      if (typeof window === "undefined") return mitProzessCommit(auftrag);
      if (locks?.request) return auftrag(); // bereits im Web Lock
      throw new Error("Keine sichere Auth-Commit-Sperre verfügbar.");
    };
    return locks?.request ? locks.request("kd:auth:session", lokal) : Promise.resolve().then(lokal);
  }

  function netz() { return fetchImpl || (typeof fetch === "function" ? fetch : null); }
  function konfiguriert() { return istSupabaseProjektUrl(basis) && anon.length > 0; }

  function kopf({ body = false, token = null } = {}) {
    const h = { apikey: anon };
    /* Alte anon-JWTs brauchen zusätzlich Bearer; moderne sb_publishable_-Keys nicht.
       Ein User-Token ersetzt den Bearer immer. */
    if (/^eyJ/.test(anon)) h.Authorization = "Bearer " + anon;
    if (token) h.Authorization = "Bearer " + token;
    if (body) h["Content-Type"] = "application/json";
    return h;
  }

  async function ruf(pfad, { method = "POST", body = null, token = null } = {}) {
    if (!konfiguriert()) {
      throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
        source: "auth", operation: "auth.config", reason: "auth-unconfigured",
        message: "Die Anmeldung ist in dieser Umgebung nicht eingerichtet.",
      });
    }
    const f = netz();
    if (!f) throw new BoundaryError(ERROR_CODES.OFFLINE, { source: "auth", operation: "auth.fetch" });
    const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
    try {
      const res = await f(basis + "/auth/v1" + pfad, {
        method,
        headers: kopf({ body: !!body, token }),
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl ? ctrl.signal : undefined,
      });
      let data = null;
      try { data = await res.json(); } catch { /* 204 */ }
      return { status: res.status, ok: res.ok, data };
    } finally { if (timer) clearTimeout(timer); }
  }

  /* Nur DAS verwirft eine Sitzung: der Server sagt eindeutig, das Refresh-Token
     ist tot. Alles andere (Netz, 5xx, Timeout) ist ein vorübergehender Zustand. */
  function istEndgueltigUngueltig(status, data) {
    if (status !== 400 && status !== 401) return false;
    const marker = JSON.stringify(data || {}).toLowerCase();
    return /invalid_grant|refresh_token_not_found|already_used|invalid refresh token|token has expired|session_not_found/.test(marker)
      || status === 401;
  }

  function fehlerAus(status, data, operation) {
    const marker = JSON.stringify(data || {}).toLowerCase();
    /* GoTrue meldet falsche Zugangsdaten mit 400, nicht 401 — ohne dieses
       Sondermapping landete ein Tippfehler beim Passwort als "ungültige Antwort". */
    if (status === 400 && /invalid.login|invalid_grant|invalid credentials/.test(marker)) {
      return new BoundaryError(ERROR_CODES.UNAUTHENTICATED, {
        source: "auth", operation, status, reason: "bad-credentials",
        message: "Benutzername oder Passwort stimmt nicht.",
      });
    }
    if (status === 422) {
      return new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
        source: "auth", operation, status, reason: "unprocessable",
        message: "Die Eingabe wurde nicht akzeptiert.",
      });
    }
    if (status === 401) return new BoundaryError(ERROR_CODES.UNAUTHENTICATED, { source: "auth", operation, status });
    if (status === 403) return new BoundaryError(ERROR_CODES.FORBIDDEN, { source: "auth", operation, status });
    if (status === 429) return new BoundaryError(ERROR_CODES.LIMIT, { source: "auth", operation, status });
    if (status >= 500) return new BoundaryError(ERROR_CODES.SERVER, { source: "auth", operation, status });
    return new BoundaryError(ERROR_CODES.INVALID_RESPONSE, { source: "auth", operation, status });
  }

  /* ---------- Anmelden ---------- */
  async function signIn(benutzername, passwort) {
    const mail = benutzernameZuMail(benutzername, mailDomain);
    if (!mail || !passwort) {
      throw new BoundaryError(ERROR_CODES.UNAUTHENTICATED, {
        source: "auth", operation: "auth.sign-in", reason: "missing-credentials",
        message: "Benutzername und Passwort sind nötig.",
      });
    }
    let antwort;
    try {
      antwort = await ruf("/token?grant_type=password", { body: { email: mail, password: passwort } });
    } catch (e) {
      throw normalizeBoundaryError(e, { source: "auth", operation: "auth.sign-in" });
    }
    if (!antwort.ok) throw fehlerAus(antwort.status, antwort.data, "auth.sign-in");
    const s = sitzungAus(antwort.data, { jetztMs: jetzt(), erwarteteMail: mail });
    if (!s) throw unvollstaendigeSitzungsantwort("auth.sign-in");
    s.sitzungsId = neueSitzungsId();
    if (!await commit(() => schreibeSitzung(s))) {
      throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
        source: "auth", operation: "auth.sign-in", reason: "storage-blocked",
        message: "Die Anmeldung konnte auf diesem Gerät nicht gespeichert werden.",
      });
    }
    zustand = AUTH_ZUSTAND.ANGEMELDET;
    return konto();
  }

  /* Frische Passwortbestätigung für irreversible Self-Service-Schritte. Der
     neue Token muss zum bereits angemeldeten Konto gehören; ein Kontowechsel
     über dieses Formular ist ausgeschlossen. */
  async function reauthenticate(passwort) {
    const vorher = leseSitzung();
    if (!vorher?.kontoId || !vorher.mail || !passwort) {
      throw new BoundaryError(ERROR_CODES.UNAUTHENTICATED, { source: "auth", operation: "auth.reauthenticate" });
    }
    let antwort;
    try { antwort = await ruf("/token?grant_type=password", { body: { email: vorher.mail, password: String(passwort) } }); }
    catch (error) { throw normalizeBoundaryError(error, { source: "auth", operation: "auth.reauthenticate" }); }
    if (!antwort.ok) throw fehlerAus(antwort.status, antwort.data, "auth.reauthenticate");
    const neu = sitzungAus(antwort.data, {
      jetztMs: jetzt(), erwarteteKontoId: vorher.kontoId, erwarteteMail: vorher.mail,
    });
    if (!neu) throw unvollstaendigeSitzungsantwort("auth.reauthenticate");
    neu.sitzungsId = vorher.sitzungsId;
    if (!await commit(() => gleicheVersion(vorher, leseSitzung()) && schreibeSitzung(neu))) {
      throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, { source: "auth", operation: "auth.reauthenticate", reason: "storage-blocked" });
    }
    zustand = AUTH_ZUSTAND.ANGEMELDET;
    return { ok: true };
  }

  /* ---------- Erneuern (single-flight, tab-übergreifend abgesichert) ---------- */
  async function refreshIntern(lauf) {
    const frisch = await commit(() => leseSitzung());
    if (!frisch) { zustand = AUTH_ZUSTAND.GAST; return null; }
    if (!gleicheAnmeldung(lauf.sitzung, frisch)) return null;
    if (frisch.gueltigBis - jetzt() > REFRESH_PUFFER_MS
        && (!lauf.forceToken || frisch.access_token !== lauf.forceToken)) {
      zustand = AUTH_ZUSTAND.ANGEMELDET;
      return frisch;
    }
    let antwort;
    lauf.angefragt = true;
    try {
      antwort = await ruf("/token?grant_type=refresh_token", { body: { refresh_token: frisch.refresh_token } });
    } catch { /* Offline erhält nur die noch aktuelle Sitzung. */ }
    return commit(() => {
      const aktuell = leseSitzung();
      if (!gleicheVersion(frisch, aktuell)) {
        // Ein neuer Login (auch desselben Kontos) gehört niemals diesem Lauf.
        if (!aktuell) zustand = AUTH_ZUSTAND.GAST;
        return gleicheAnmeldung(frisch, aktuell) ? aktuell : null;
      }
      if (antwort?.ok) {
        const neu = sitzungAus(antwort.data, {
          jetztMs: jetzt(), erwarteteKontoId: frisch.kontoId, erwarteteMail: frisch.mail,
        });
        if (neu) {
          neu.sitzungsId = frisch.sitzungsId;
          if (schreibeSitzung(neu)) {
            zustand = AUTH_ZUSTAND.ANGEMELDET;
            return neu;
          }
        }
      } else if (antwort && istEndgueltigUngueltig(antwort.status, antwort.data)) {
        if (loescheSitzung()) {
          zustand = AUTH_ZUSTAND.ABGELAUFEN;
          return null;
        }
      }
      zustand = AUTH_ZUSTAND.DEGRADIERT;
      return frisch;
    });
  }

  async function refresh({ erzwingeErneuerung = false, sitzung = leseSitzung() } = {}) {
    if (!sitzung) { zustand = AUTH_ZUSTAND.GAST; return null; }
    if (!erzwingeErneuerung && sitzung.gueltigBis - jetzt() > REFRESH_PUFFER_MS) {
      zustand = AUTH_ZUSTAND.ANGEMELDET;
      return sitzung;
    }
    let lauf = refreshLaeuft;
    if (lauf && !gleicheVersion(lauf.sitzung, sitzung)) {
      // Ein neuer Login oder abgelehnter neuer Bearer gehört nicht zum alten Lauf.
      lauf = null;
    }
    if (!lauf) {
      lauf = { sitzung, forceToken: erzwingeErneuerung ? sitzung.access_token : null, angefragt: false };
      const ausfuehren = () => refreshIntern(lauf);
      lauf.promise = Promise.resolve().then(() => locks?.request
        ? locks.request("kd:auth:refresh", ausfuehren) : ausfuehren())
        .catch(() => { zustand = AUTH_ZUSTAND.DEGRADIERT; return null; })
        .finally(() => { if (refreshLaeuft === lauf) refreshLaeuft = null; });
      refreshLaeuft = lauf;
    } else if (erzwingeErneuerung) {
      lauf.forceToken = sitzung.access_token;
    }
    const neu = await lauf.promise;
    // Force kann nach dem regulären Schnellpfad, aber vor dessen Promise-
    // Abschluss eintreffen. Nur dieser requestfreie Lauf braucht einen Nachlauf.
    if (erzwingeErneuerung && !lauf.angefragt && gleicheVersion(sitzung, neu)) {
      return refresh({ erzwingeErneuerung: true, sitzung });
    }
    return neu;
  }

  /* ---------- Zugriffstoken für den Datentreiber ---------- */
  async function getAccessToken({ erzwingeErneuerung = false, erwarteteKontoId = null } = {}) {
    const erwartet = erwarteteKontoId == null ? null : String(erwarteteKontoId);
    const s = leseSitzung();
    if (!s) { zustand = AUTH_ZUSTAND.GAST; return null; }
    if (erwartet && String(s.kontoId || "") !== erwartet) return null;
    if (!erzwingeErneuerung && s.gueltigBis - jetzt() > REFRESH_PUFFER_MS) {
      zustand = AUTH_ZUSTAND.ANGEMELDET;
      return s.access_token;
    }
    const neu = await refresh({ erzwingeErneuerung, sitzung: s });
    if (!gleicheVersion(neu, leseSitzung())) return null;
    if (erwartet && String(neu?.kontoId || "") !== erwartet) return null;
    return neu ? neu.access_token : null;
  }

  /* ---------- Passwort ändern ---------- */
  async function changePassword(neuesPasswort) {
    const passwort = String(neuesPasswort || "");
    if (passwort.length < 8) {
      throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
        source: "auth", operation: "auth.change-password", reason: "too-short",
        message: "Das neue Passwort braucht mindestens 8 Zeichen.",
      });
    }
    const token = await getAccessToken();
    if (!token) throw new BoundaryError(ERROR_CODES.UNAUTHENTICATED, { source: "auth", operation: "auth.change-password" });
    let antwort;
    try { antwort = await ruf("/user", { method: "PUT", body: { password: passwort }, token }); }
    catch (e) { throw normalizeBoundaryError(e, { source: "auth", operation: "auth.change-password" }); }
    if (!antwort.ok) throw fehlerAus(antwort.status, antwort.data, "auth.change-password");
    return { ok: true };
  }

  /* ---------- Abmelden ----------
     Ein fehlgeschlagener Serverruf blockiert den lokalen Logout nicht. Die
     lokale Credential-Löschung erfolgt aber erst, nachdem der Coordinator den
     persönlichen Kontocache sicher getrennt hat. Scheitert diese Privacy-
     Grenze oder die Credential-Persistenz, bleibt die lokale Sitzung bewusst
     erhalten beziehungsweise gesperrt statt einen unsicheren Gast zu melden. */
  async function signOut({ beforeLocalCommit = null } = {}) {
    const s = leseSitzung();
    if (s?.access_token) {
      try { await ruf("/logout", { token: s.access_token }); } catch { /* lokaler Logout gilt */ }
    }
    /* Der Session-Koordinator darf den persönlichen Cache genau zwischen
       abgeschlossenem Serverversuch und lokaler Credential-Löschung trennen.
       Wirft diese Privacy-Grenze, bleiben die lokalen Zugangsdaten erhalten. */
    if (typeof beforeLocalCommit === "function") await beforeLocalCommit();
    if (!await commit(() => {
      const aktuell = leseSitzung();
      if (aktuell && !gleicheAnmeldung(s, aktuell)) return false;
      return loescheSitzung();
    })) {
      const error = new Error("Die lokale Anmeldung konnte nicht sicher entfernt werden.");
      error.code = "AUTH_CREDENTIAL_PERSISTENCE_FAILED";
      throw error;
    }
    zustand = AUTH_ZUSTAND.GAST;
    return { ok: true };
  }

  /* ---------- Auskunft ---------- */
  function konto() {
    const s = leseSitzung();
    if (!s) return null;
    return { id: s.kontoId, benutzername: s.benutzername, email: s.mail, gueltigBis: s.gueltigBis };
  }
  function getZustand() { return zustand; }

  /* Für authService.initialize(): tokenfreie Projektion der Sitzung. */
  async function loadSession() {
    const s = leseSitzung();
    /* Kein gespeicherter Zugang: Gast. War die Sitzung in dieser Laufzeit gerade
       endgültig abgelaufen, wird das mitgemeldet — die Oberfläche soll den
       Unterschied zwischen "nie angemeldet" und "Anmeldung ist abgelaufen" zeigen. */
    if (!s) return { mode: "guest", abgelaufen: zustand === AUTH_ZUSTAND.ABGELAUFEN };
    await refresh();                      // beim Start einmal erneuern, wenn nötig
    const k = konto();
    if (!k) {
      return { mode: "guest", abgelaufen: zustand === AUTH_ZUSTAND.ABGELAUFEN };
    }
    /* Die Freigabe wird bei jedem Session-Laden neu aus der Own-Row-RLS
       gelesen. Sie wird bewusst nicht im Browser persistiert: Widerruf und
       Rollenwechsel müssen beim nächsten Refresh sichtbar werden, während
       fehlende/kaputte/unerreichbare Antworten immer geschlossen ausfallen. */
    const token = await getAccessToken({ erwarteteKontoId: k.id });
    const access = await loadOwnAccountAccess({
      config, token, fetchImpl: netz(),
    });
    /* Ein langsamer Request von Konto A darf nach Logout oder Wechsel zu B
       keine Freigabe mehr projizieren. Der Auth-Service ignoriert `stale` und
       behält den inzwischen neueren Snapshot. */
    const aktuell = konto();
    if (!aktuell || String(aktuell.id || "") !== String(k.id || "")) {
      return { mode: "stale", accountId: k.id };
    }
    return {
      mode: "account",
      account: { id: k.id, displayName: k.benutzername, email: k.email },
      expiresAt: new Date(k.gueltigBis).toISOString(),
      role: access.role,
      access,
      capabilities: {
        remoteStorage: access.active === true,
        personalAi: access.active === true && access.personalAi === true,
      },
      degradiert: zustand === AUTH_ZUSTAND.DEGRADIERT
        || access.status === ACCOUNT_ACCESS_STATUS.UNAVAILABLE,
    };
  }

  return Object.freeze({
    name: "supabase-auth",
    istKonfiguriert: konfiguriert,
    signIn, signOut, refresh, changePassword, reauthenticate,
    getAccessToken, konto, getZustand, loadSession,
  });
}
