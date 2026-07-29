#!/usr/bin/env node
/* Einmalige kostenpflichtige Remote-Abnahme für Etappe 7.
   ==========================================================================
   Der Lauf sendet drei ausdrücklich synthetische Filmantworten an die echte,
   deployte `profile-extract`-Aufgabe. Er speichert weder Antworten noch das
   Ergebnis im Testkonto. Genau ein Anbieteraufruf ist erlaubt; Wiederholungen
   oder automatische Reparaturversuche gibt es in diesem Programm nicht.

   Niemals direkt starten. `npm run test:ai:profile-live` legt den
   Budgetwächter davor und danach und lädt das Testpasswort ausschließlich aus
   dem macOS-Schlüsselbund.
   ========================================================================== */

const URL_BASIS = String(process.env.KD_SB_URL || "").trim().replace(/\/+$/, "");
const ANON = String(process.env.KD_SB_ANON || "").trim();
const USER = String(process.env.KD_TESTA_USER || "testa").trim();
const PASS = String(process.env.KD_TESTA_PASS || "");
const MAIL_DOMAIN = String(process.env.KD_MAIL_DOMAIN || "login.kinodreieck.at").trim();
const FUNKTION = String(process.env.KD_AI_FUNKTION || "ai-task").trim();
const ORIGIN = String(process.env.KD_ORIGIN || "https://staging.kinodreieck.at").trim();

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(URL_BASIS) || !ANON || !PASS) {
  console.error("LIVE_PROFIL_UNBEKANNT: Ziel oder Testkonto fehlt.");
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
          K1: "Die Hotelsequenz in In the Mood for Love zieht mich wegen der warmen Farben und der langsamen, präzisen Kamera an.",
          K2: "Arrival sehe ich immer wieder, weil mich ruhiges Science-Fiction-Erzählen und die nichtlineare Struktur anziehen.",
          K4: "Mad Max: Fury Road sollte man wegen seiner visuellen Inszenierung und dem klaren Rhythmus gesehen haben.",
        },
        listen: {
          genres: [
            "Action", "Drama", "Horror", "Komödie", "Romanze",
            "Science-Fiction", "Thriller", "Dokumentarfilm",
          ],
        },
      },
    }),
  });
  const daten = await antwort.json().catch(() => null);
  const profil = daten?.data;
  const signale = Array.isArray(profil?.signale) ? profil.signale : null;
  const filme = Array.isArray(profil?.filme) ? profil.filme : null;
  const nichtDeutbar = Array.isArray(profil?.nicht_deutbar) ? profil.nicht_deutbar : null;
  const achsen = profil?.achsen_tendenz;
  const kosten = daten?.verbrauch?.kostenUsdCent;
  const hatProfilInhalt = (signale?.length || 0) > 0
    || (filme?.length || 0) > 0
    || ["wie", "was", "warum"].some((key) => Number.isInteger(achsen?.[key]));
  const ok = antwort.status === 200
    && daten?.ok === true
    && daten?.task === "profile-extract"
    && signale !== null
    && filme !== null
    && nichtDeutbar !== null
    && achsen && typeof achsen === "object"
    && Number.isFinite(kosten) && kosten > 0
    && hatProfilInhalt;

  if (!ok) {
    console.error(
      "LIVE_PROFIL_ABWEICHEND: "
      + `HTTP ${antwort.status}, code=${String(daten?.code || "-")}, `
      + `grund=${String(daten?.grund || "-")}`,
    );
    process.exit(1);
  }

  console.log(
    "LIVE-PROFIL BESTANDEN: "
    + `${signale.length} Signal(e), ${filme.length} Film(e), `
    + `${Number(profil?.verworfen_ohne_beleg || 0)} ohne Beleg verworfen; `
    + `${kosten} US-Cent.`,
  );
} catch (error) {
  console.error(`LIVE_PROFIL_UNBEKANNT: ${error?.message || "Netz- oder Anmeldefehler."}`);
  process.exit(2);
}
