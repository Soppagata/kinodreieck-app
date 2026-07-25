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
import { BoundaryError, ERROR_CODES, normalizeBoundaryError } from "../services/errors.js";

export const AUTH_SESSION_KEY = "kd:auth:session";
export const STANDARD_MAIL_DOMAIN = "login.kinodreieck.at";
const SESSION_SCHEMA = 1;
const REFRESH_PUFFER_MS = 5 * 60 * 1000;   // so früh vor Ablauf proaktiv erneuern
const TIMEOUT_MS = 10000;

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
    if (!s || s.v !== SESSION_SCHEMA || !s.access_token || !s.refresh_token) return null;
    return s;
  } catch { return null; }
}
function schreibeSitzung(s) {
  try { localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(s)); return true; }
  catch { return false; }
}
function loescheSitzung() {
  try { localStorage.removeItem(AUTH_SESSION_KEY); } catch { /* best effort */ }
}
export function hatGespeicherteSitzung() { return !!leseSitzung(); }

/* `jetztMs` kommt immer von der Uhr des Treibers — nie direkt von Date.now().
   Sonst liefen Ablaufrechnung und Ablaufprüfung auf zwei verschiedenen Uhren. */
function sitzungAus(daten, vorher = null, jetztMs = Date.now()) {
  const gueltigBis = Number.isFinite(daten?.expires_at)
    ? daten.expires_at * 1000
    : jetztMs + (Number(daten?.expires_in) || 3600) * 1000;
  const mail = daten?.user?.email || vorher?.mail || "";
  return {
    v: SESSION_SCHEMA,
    access_token: daten.access_token,
    refresh_token: daten.refresh_token || vorher?.refresh_token || "",
    gueltigBis,
    kontoId: daten?.user?.id || vorher?.kontoId || "",
    mail,
    benutzername: mailZuBenutzername(mail) || vorher?.benutzername || "",
  };
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
    if (!antwort.ok || !antwort.data?.access_token) throw fehlerAus(antwort.status, antwort.data, "auth.sign-in");
    const s = sitzungAus(antwort.data, null, jetzt());
    if (!schreibeSitzung(s)) {
      throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
        source: "auth", operation: "auth.sign-in", reason: "storage-blocked",
        message: "Die Anmeldung konnte auf diesem Gerät nicht gespeichert werden.",
      });
    }
    zustand = AUTH_ZUSTAND.ANGEMELDET;
    return konto();
  }

  /* ---------- Erneuern (single-flight, tab-übergreifend abgesichert) ---------- */
  async function refreshIntern() {
    /* Im Lock zuerst neu lesen: ein anderer Tab kann inzwischen rotiert haben —
       dann ist dessen Ergebnis zu übernehmen statt ein zweites Mal zu rotieren. */
    const frisch = leseSitzung();
    if (!frisch) { zustand = AUTH_ZUSTAND.GAST; return null; }
    if (frisch.gueltigBis - jetzt() > REFRESH_PUFFER_MS) {
      zustand = AUTH_ZUSTAND.ANGEMELDET;
      return frisch;
    }
    let antwort;
    try {
      antwort = await ruf("/token?grant_type=refresh_token", { body: { refresh_token: frisch.refresh_token } });
    } catch {
      /* Netz weg / Timeout: Sitzung BEHALTEN. Das ist der Unterschied zwischen
         "kurz offline" und "ausgeloggt" — und der Grund, warum ein pausiertes
         Supabase-Projekt niemanden aus seinen Daten aussperrt. */
      zustand = AUTH_ZUSTAND.DEGRADIERT;
      return frisch;
    }
    if (antwort.ok && antwort.data?.access_token) {
      const neu = sitzungAus(antwort.data, frisch, jetzt());
      schreibeSitzung(neu);
      zustand = AUTH_ZUSTAND.ANGEMELDET;
      return neu;
    }
    if (istEndgueltigUngueltig(antwort.status, antwort.data)) {
      loescheSitzung();
      zustand = AUTH_ZUSTAND.ABGELAUFEN;
      return null;
    }
    zustand = AUTH_ZUSTAND.DEGRADIERT;   // 5xx / 429 / unklar: Sitzung behalten
    return frisch;
  }

  async function refresh() {
    if (refreshLaeuft) return refreshLaeuft;
    const lauf = async () => {
      if (locks && typeof locks.request === "function") {
        try { return await locks.request("kd:auth:refresh", refreshIntern); }
        catch { return await refreshIntern(); }
      }
      return await refreshIntern();
    };
    refreshLaeuft = lauf().finally(() => { refreshLaeuft = null; });
    return refreshLaeuft;
  }

  /* ---------- Zugriffstoken für den Datentreiber ---------- */
  async function getAccessToken({ erzwingeErneuerung = false } = {}) {
    const s = leseSitzung();
    if (!s) { zustand = AUTH_ZUSTAND.GAST; return null; }
    if (!erzwingeErneuerung && s.gueltigBis - jetzt() > REFRESH_PUFFER_MS) {
      zustand = AUTH_ZUSTAND.ANGEMELDET;
      return s.access_token;
    }
    const neu = await refresh();
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
     Lokal ist der Logout IMMER erfolgreich: ein fehlgeschlagener Serverruf darf
     den Nutzer nicht in einer Sitzung festhalten, die er beenden wollte.
     Persönliche Daten (die kd:*-Töpfe) werden dabei NIE angefasst. */
  async function signOut() {
    const s = leseSitzung();
    loescheSitzung();
    zustand = AUTH_ZUSTAND.GAST;
    if (s?.access_token) {
      try { await ruf("/logout", { token: s.access_token }); } catch { /* lokaler Logout gilt */ }
    }
    return { ok: true };
  }

  /* ---------- Auskunft ---------- */
  function konto() {
    const s = leseSitzung();
    if (!s) return null;
    return { id: s.kontoId, benutzername: s.benutzername, gueltigBis: s.gueltigBis };
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
    return {
      mode: "account",
      account: { id: k.id, displayName: k.benutzername },
      expiresAt: new Date(k.gueltigBis).toISOString(),
      capabilities: { remoteStorage: true, personalAi: false },
      degradiert: zustand === AUTH_ZUSTAND.DEGRADIERT,
    };
  }

  return Object.freeze({
    name: "supabase-auth",
    istKonfiguriert: konfiguriert,
    signIn, signOut, refresh, changePassword,
    getAccessToken, konto, getZustand, loadSession,
  });
}
