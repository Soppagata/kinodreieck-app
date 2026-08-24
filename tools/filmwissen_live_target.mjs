#!/usr/bin/env node
/* Providerfreier Ziel-Preflight fuer den normalen AI-Live-Smoke.
   ==========================================================================
   Die Owner-Rauchprobe darf Filmwissen nicht mehr gegen einen stillen festen
   Fallback pruefen: ein bereits publiziertes Werk endet legitim im Cache und
   kann deshalb keinen neuen Anbieterbeleg erzeugen.

   Dieser schmale Einstieg liegt weiterhin HINTER dem bestehenden
   ai_budget_guard. Er meldet sich mit derselben Owner-Sitzung an, liest fuer
   eine explizit konfigurierte, begrenzte Kandidatenliste seriell nur die enge
   Filmwissen-RPC und reicht den ersten echten Cache-Miss an ai_smoke.mjs
   weiter. Er ruft weder ai-task noch einen Anbieter auf, legt keine Daten an
   und wiederholt keinen Request. IDs, Titel, Konten und Antwortkoerper werden
   nie ausgegeben.
   ========================================================================== */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  BUDGET_FETCH_TIMEOUT_MS,
  BUDGET_UNBEKANNT_EXIT,
  LiveSicherheitsStopp,
  fetchMitZeitgrenze,
  liesJsonOderNull,
} from "./ai_budget_guard.mjs";
import {
  OWNER_CORE_SIX_GUARD_ENV,
  OWNER_CORE_SIX_GUARD_VALUE,
} from "./provider_raw_capture.mjs";
import {
  FILMWISSEN_STATUS,
  dekodiereFilmwissen,
  normalisiereFilmkennung,
} from "../src/lib/filmwissen.js";

export const FILMWISSEN_TARGET_ID_ENV = "KD_FILMWISSEN_TARGET_ID";
export const FILMWISSEN_TARGET_IDS_ENV = "KD_FILMWISSEN_TARGET_IDS";
export const FILMWISSEN_LIVE_TARGET_MAX = 8;
export const FILMWISSEN_PREFLIGHT_EXIT = 64;

const RECHERCHE_NAMENSRAEUME = new Set(["imdb", "tmdb", "wikidata"]);
const CACHE_STATUS = new Set([
  FILMWISSEN_STATUS.BELEGT,
  FILMWISSEN_STATUS.NICHT_BELEGT,
]);

export class FilmwissenLiveTargetFehler extends Error {
  constructor(message) {
    super(message);
    this.name = "FilmwissenLiveTargetFehler";
    this.exitCode = FILMWISSEN_PREFLIGHT_EXIT;
  }
}

export function normalisiereFilmwissenLiveTarget(wert) {
  const roh = typeof wert === "string" ? wert.trim() : "";
  const match = /^([a-z]+):([^\s:,]{1,150})$/i.exec(roh);
  const namespace = match?.[1]?.toLowerCase() ?? "";
  if (!match || !RECHERCHE_NAMENSRAEUME.has(namespace)) return null;
  const kennung = normalisiereFilmkennung(namespace, match[2]);
  return kennung ? Object.freeze({ namespace, kennung }) : null;
}

function targetAlsText(target) {
  return `${target.namespace}:${target.kennung}`;
}

export function liesFilmwissenLiveTargets({ einzel = "", liste = "" } = {}) {
  const einzelRoh = typeof einzel === "string" ? einzel.trim() : "";
  const listeRoh = typeof liste === "string" ? liste.trim() : "";
  if (einzelRoh && listeRoh) {
    throw new FilmwissenLiveTargetFehler(
      "Filmwissen-Liveziel ist mehrdeutig konfiguriert.",
    );
  }
  const teile = listeRoh ? listeRoh.split(",").map((wert) => wert.trim())
    : (einzelRoh ? [einzelRoh] : []);
  if (teile.length < 1) {
    throw new FilmwissenLiveTargetFehler(
      "Filmwissen-Liveziel fehlt; ein expliziter, institutionell belegter Kandidat ist Pflicht.",
    );
  }
  if (teile.length > FILMWISSEN_LIVE_TARGET_MAX || teile.some((wert) => !wert)) {
    throw new FilmwissenLiveTargetFehler(
      "Filmwissen-Livezielliste ist leer, formfremd oder zu lang.",
    );
  }

  const gesehen = new Set();
  const ziele = teile.map((wert) => {
    const target = normalisiereFilmwissenLiveTarget(wert);
    if (!target) {
      throw new FilmwissenLiveTargetFehler(
        "Filmwissen-Livezielliste enthaelt keine ausschliesslich starken realen Kennungen.",
      );
    }
    const kanonisch = targetAlsText(target);
    if (gesehen.has(kanonisch)) {
      throw new FilmwissenLiveTargetFehler(
        "Filmwissen-Livezielliste enthaelt ein doppeltes Ziel.",
      );
    }
    gesehen.add(kanonisch);
    return target;
  });
  return Object.freeze(ziele);
}

export async function waehleFilmwissenCacheMiss({ ziele, liesAktuell } = {}) {
  if (!Array.isArray(ziele) || ziele.length < 1 ||
      ziele.length > FILMWISSEN_LIVE_TARGET_MAX || typeof liesAktuell !== "function") {
    throw new FilmwissenLiveTargetFehler("Filmwissen-Preflight ist unvollstaendig.");
  }

  let geprueft = 0;
  for (const target of ziele) {
    let antwort;
    try {
      antwort = await liesAktuell(target);
    } catch (error) {
      if (error instanceof LiveSicherheitsStopp) throw error;
      throw new FilmwissenLiveTargetFehler(
        "Filmwissen-Cache-Preflight war nicht sicher lesbar.",
      );
    }
    geprueft += 1;
    if (antwort?.status !== 200) {
      throw new FilmwissenLiveTargetFehler(
        "Filmwissen-Cache-Preflight lieferte keinen erfolgreichen Readback.",
      );
    }

    let gelesen;
    try {
      gelesen = dekodiereFilmwissen(antwort.daten);
    } catch {
      throw new FilmwissenLiveTargetFehler(
        "Filmwissen-Cache-Preflight verletzte den Produktionsvertrag.",
      );
    }
    if (gelesen.status === FILMWISSEN_STATUS.CACHE_MISS) {
      return Object.freeze({ target, geprueft });
    }
    if (CACHE_STATUS.has(gelesen.status)) continue;
    throw new FilmwissenLiveTargetFehler(
      "Filmwissen-Cache-Preflight ist fachlich gesperrt.",
    );
  }

  throw new FilmwissenLiveTargetFehler(
    "Alle Filmwissen-Liveziele besitzen bereits eine aktuelle Synthese.",
  );
}

function liesVerbindung(env) {
  const urlBasis = String(env?.KD_SB_URL || "").trim().replace(/\/+$/, "");
  const anon = String(env?.KD_SB_ANON || "").trim();
  const user = String(env?.KD_TESTA_USER || "").trim();
  const pass = typeof env?.KD_TESTA_PASS === "string" ? env.KD_TESTA_PASS : "";
  const mailDomain = String(env?.KD_MAIL_DOMAIN || "login.kinodreieck.at").trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(urlBasis) ||
      !anon || !user || !pass || !/^[a-z0-9.-]+$/i.test(mailDomain) ||
      /[\0\r\n@]/.test(user)) {
    throw new FilmwissenLiveTargetFehler(
      "Filmwissen-Preflight-Konfiguration ist unvollstaendig.",
    );
  }
  return { urlBasis, anon, user, pass, mailDomain };
}

async function meldeFuerPreflightAn(verbindung, fetchImpl) {
  let antwort;
  try {
    antwort = await fetchMitZeitgrenze(
      `${verbindung.urlBasis}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: { apikey: verbindung.anon, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${verbindung.user}@${verbindung.mailDomain}`,
          password: verbindung.pass,
        }),
      },
      { fetchImpl, timeoutMs: BUDGET_FETCH_TIMEOUT_MS },
    );
    const daten = await liesJsonOderNull(antwort);
    if (!antwort.ok || typeof daten?.access_token !== "string" || !daten.access_token) {
      throw new FilmwissenLiveTargetFehler(
        "Filmwissen-Preflight-Anmeldung wurde abgewiesen.",
      );
    }
    return daten.access_token;
  } catch (error) {
    if (error instanceof LiveSicherheitsStopp || error instanceof FilmwissenLiveTargetFehler) {
      throw error;
    }
    throw new FilmwissenLiveTargetFehler(
      "Filmwissen-Preflight-Anmeldung war nicht sicher erreichbar.",
    );
  }
}

async function liesFilmwissenRpc(verbindung, token, target, fetchImpl) {
  let antwort;
  try {
    antwort = await fetchMitZeitgrenze(
      `${verbindung.urlBasis}/rest/v1/rpc/kd_filmwissen_aktuell_lesen`,
      {
        method: "POST",
        headers: {
          apikey: verbindung.anon,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_namespace: target.namespace,
          p_kennung: target.kennung,
        }),
      },
      { fetchImpl, timeoutMs: BUDGET_FETCH_TIMEOUT_MS },
    );
    return { status: antwort.status, daten: await liesJsonOderNull(antwort) };
  } catch (error) {
    if (error instanceof LiveSicherheitsStopp) throw error;
    throw new FilmwissenLiveTargetFehler(
      "Filmwissen-Cache-Preflight war nicht sicher erreichbar.",
    );
  }
}

export async function fuehreFilmwissenLivePreflightAus({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const ziele = liesFilmwissenLiveTargets({
    einzel: env?.[FILMWISSEN_TARGET_ID_ENV],
    liste: env?.[FILMWISSEN_TARGET_IDS_ENV],
  });
  const verbindung = liesVerbindung(env);
  const token = await meldeFuerPreflightAn(verbindung, fetchImpl);
  const auswahl = await waehleFilmwissenCacheMiss({
    ziele,
    liesAktuell: (target) => liesFilmwissenRpc(verbindung, token, target, fetchImpl),
  });

  env[FILMWISSEN_TARGET_ID_ENV] = targetAlsText(auswahl.target);
  delete env[FILMWISSEN_TARGET_IDS_ENV];
  return Object.freeze({ geprueft: auswahl.geprueft });
}

export async function runAiLiveSmoke({
  env = process.env,
  fetchImpl = fetch,
  smokeImporter = () => import("./ai_smoke.mjs"),
  ausgabe = console.log,
  fehlerAusgabe = console.error,
} = {}) {
  if (env?.[OWNER_CORE_SIX_GUARD_ENV] === OWNER_CORE_SIX_GUARD_VALUE) {
    let preflight;
    try {
      preflight = await fuehreFilmwissenLivePreflightAus({ env, fetchImpl });
    } catch (error) {
      const bekannt = error instanceof FilmwissenLiveTargetFehler ||
        error instanceof LiveSicherheitsStopp;
      fehlerAusgabe(
        `FILMWISSEN_PREFLIGHT_STOPP: ${bekannt
          ? error.message
          : "Filmwissen-Preflight ist unerwartet fehlgeschlagen."}`,
      );
      return Number.isInteger(error?.exitCode)
        ? error.exitCode
        : BUDGET_UNBEKANNT_EXIT;
    }
    ausgabe(
      `Filmwissen-Preflight: Cache-Miss nach ${preflight.geprueft} providerfreien Readback(s) gewaehlt.`,
    );
  }
  await smokeImporter();
  return 0;
}

export async function main() {
  return runAiLiveSmoke();
}

const direktGestartet = process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direktGestartet) {
  main().then((code) => { process.exitCode = code; });
}
