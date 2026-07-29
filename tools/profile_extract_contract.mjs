#!/usr/bin/env node
/* Kostenfreie Remote-Vertragsprobe für Etappe 7.
   ==========================================================================
   Sie sendet absichtlich eine leere Genre-Werteliste. `profile-extract` muss
   das mit 400/wertelisten-fehlen VOR Reservierung und Anbieteraufruf ablehnen.
   Damit belegt der Lauf, dass die Aufgabe in der deployten Function vorhanden
   ist, ohne persönliche Antworten oder KI-Kosten zu erzeugen.

   Autonome Agenten starten diese Datei nur über
   `npm run test:ai:contract`; der Budgetwächter misst davor und danach.
   ========================================================================== */

const URL_BASIS = String(process.env.KD_SB_URL || "").trim().replace(/\/+$/, "");
const ANON = String(process.env.KD_SB_ANON || "").trim();
const USER = String(process.env.KD_TESTA_USER || "testa").trim();
const PASS = String(process.env.KD_TESTA_PASS || "");
const MAIL_DOMAIN = String(process.env.KD_MAIL_DOMAIN || "login.kinodreieck.at").trim();
const FUNKTION = String(process.env.KD_AI_FUNKTION || "ai-task").trim();
const ORIGIN = String(process.env.KD_ORIGIN || "https://kinodreieck.at").trim();

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(URL_BASIS) || !ANON || !PASS) {
  console.error("REMOTE_VERTRAG_UNBEKANNT: Ziel oder Testkonto fehlt.");
  process.exit(2);
}

async function anmelden() {
  const antwort = await fetch(`${URL_BASIS}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `${USER}@${MAIL_DOMAIN}`,
      password: PASS,
    }),
  });
  const daten = await antwort.json().catch(() => null);
  if (!antwort.ok || typeof daten?.access_token !== "string") {
    throw new Error(`Testkonto nicht erreichbar (HTTP ${antwort.status}).`);
  }
  return daten.access_token;
}

try {
  const token = await anmelden();
  const antwort = await fetch(`${URL_BASIS}/functions/v1/${FUNKTION}`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      task: "profile-extract",
      vorgangId: crypto.randomUUID(),
      payload: {
        antworten: {
          K1: "Synthetische Vertragsprobe ohne auswertbare persönliche Antwort.",
        },
        listen: { genres: [] },
      },
    }),
  });
  const daten = await antwort.json().catch(() => null);
  const ok = antwort.status === 400
    && daten?.ok === false
    && daten?.code === "invalid-response"
    && daten?.grund === "wertelisten-fehlen";
  if (!ok) {
    console.error(
      "REMOTE_VERTRAG_ABWEICHEND: "
      + `HTTP ${antwort.status}, code=${String(daten?.code || "-")}, `
      + `grund=${String(daten?.grund || "-")}`,
    );
    process.exit(1);
  }
  console.log(
    "REMOTE-PROFIL-VERTRAG BESTANDEN: profile-extract ist deployt; "
    + "Wertelisten-Gate stoppt vor dem Anbieter.",
  );
} catch (error) {
  console.error(`REMOTE_VERTRAG_UNBEKANNT: ${error?.message || "Netz- oder Anmeldefehler."}`);
  process.exit(2);
}
