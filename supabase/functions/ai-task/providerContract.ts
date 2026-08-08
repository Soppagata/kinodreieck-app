/* Pure Anbietergrenze: Exakt derselbe Körper dient der Kostenreservierung und
   dem späteren Request. Das Modul kennt weder Deno, Secrets noch Netzwerk. */

export function baueAnbieterKoerper(
  modell: string,
  system: string,
  nutzertext: string,
  maxTokens: number,
  schema: Record<string, unknown> | null,
  bilder: AnbieterBild[] = [],
): Record<string, unknown> {
  const content: unknown = bilder.length
    ? [
      ...bilder.map((bild) => ({
        type: "image",
        source: { type: "base64", media_type: bild.media_type, data: bild.data },
      })),
      { type: "text", text: nutzertext },
    ]
    : nutzertext;
  const koerper: Record<string, unknown> = {
    model: modell,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content }],
  };
  if (schema) {
    koerper.output_config = { format: { type: "json_schema", schema } };
  }
  return koerper;
}

export type AnbieterBild = {
  media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  data: string;
};

/* Owner-Sicherheitsgrenze fuer jeden einzelnen zahlenden Anbieterrequest.
   Die Datenbank darf darunter einen engeren Betriebswert setzen, aber niemals
   darueber. Der Wert steht hier im puren Vertragsmodul, damit dieselbe
   Entscheidung vor dem Netzwerkaufruf kostenfrei getestet werden kann. */
export const ANBIETER_REQUEST_MAX_USD_CENT = 500;
export const ANBIETER_REQUEST_TIMEOUT_MAX_MS = 135_000;
export const ANBIETER_INTERNE_TOKEN_RESERVE = 4096;
export const ANBIETER_BILD_MAX_ANZAHL = 3;
export const ANBIETER_BILD_BASE64_MAX_ZEICHEN_GESAMT = 900_000;

/* Unverrueckbarer Preisboden fuer die einzigen Provider-Modellfamilien, die
   dieser Build senden darf (US-Cent je 1 Mio. Tokens). Die DB bleibt fuer
   Preissteigerungen nach oben konfigurierbar, kann die Vorabreservierung aber
   weder versehentlich noch absichtlich durch kleinere positive Werte
   unterlaufen. Ein neues Modell braucht zuerst eine bewusste Codeaenderung;
   unbekannte IDs fallen geschlossen aus. */
export const ANBIETER_OWNER_PREISBODEN_USD_CENT_PRO_MTOK = Object.freeze({
  "claude-haiku-4-5": Object.freeze({ in: 100, out: 500 }),
  /* Bereits ab diesem Release den ab 01.09.2026 angekuendigten Regelpreis
     reservieren. Der bis 31.08. gueltige Einfuehrungspreis 200/1000 waere
     danach kein harter Zaun mehr; die vorgezogene Ueberreservierung ist
     bewusst sicherer als ein datumsabhaengiger Umschaltpfad. */
  "claude-sonnet-5": Object.freeze({ in: 300, out: 1500 }),
});

const ANBIETER_MODELL_FORMEN = Object.freeze({
  "claude-haiku-4-5": /^claude-haiku-4-5(?:-[0-9]{8})?$/,
  "claude-sonnet-5": /^claude-sonnet-5(?:-[0-9]{8})?$/,
});

export function anbieterOwnerPreisboden(
  modell: unknown,
): { in: number; out: number } | null {
  if (typeof modell !== "string") return null;
  /* Laengster Praefix gewinnt, falls kuenftig eine Modellfamilie spezieller
     benannt wird. Der aktuelle Haiku kommt vom Provider mit Datumssuffix
     zurueck; Sonnet ist derzeit undatiert. */
  const treffer = Object.entries(ANBIETER_OWNER_PREISBODEN_USD_CENT_PRO_MTOK)
    .filter(([praefix]) => ANBIETER_MODELL_FORMEN[praefix as keyof typeof ANBIETER_MODELL_FORMEN]
      .test(modell))
    .sort(([a], [b]) => b.length - a.length)[0];
  return treffer ? { ...treffer[1] } : null;
}

/* Offizieller Vision-Deckel nach dem providerseitigen Resize: Standardtier
   maximal 1.568 Bildtokens, High-Res maximal 4.784. Kinodreieck erlaubt nur
   die beiden bekannten Modellfamilien und reserviert je Bild den vollen
   jeweiligen Tierdeckel, nie eine Durchschnittsschätzung. */
export function anbieterBildTokenMax(modell: unknown): number | null {
  if (typeof modell !== "string") return null;
  if (ANBIETER_MODELL_FORMEN["claude-haiku-4-5"].test(modell)) {
    return 1568;
  }
  if (ANBIETER_MODELL_FORMEN["claude-sonnet-5"].test(modell)) {
    return 4784;
  }
  return null;
}

function liesU16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function liesU16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function liesU24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function liesU32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] + bytes[offset + 1] * 2 ** 8 +
    bytes[offset + 2] * 2 ** 16 + bytes[offset + 3] * 2 ** 24) >>> 0;
}

function liesU32BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] * 2 ** 24 + bytes[offset + 1] * 2 ** 16 +
    bytes[offset + 2] * 2 ** 8 + bytes[offset + 3]) >>> 0;
}

function ascii(bytes: Uint8Array, offset: number, laenge: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + laenge));
}

function positiveDimensionen(breite: number, hoehe: number): boolean {
  return Number.isInteger(breite) && Number.isInteger(hoehe) &&
    breite > 0 && hoehe > 0;
}

/* Base64-Form allein reicht nicht: Auch syntaktisch gueltiger Muell wuerde
   sonst bis zum Provider gelangen. Wir lesen deshalb die Abmessungen aus dem
   tatsaechlichen, voll dekodierbaren Bildcontainer und verlangen bei den
   einfachen Formaten auch deren Abschlussmarker. Die Dimension dient nicht
   als Durchschnittsschaetzung; danach gilt weiterhin der volle Vision-Cap. */
function anbieterBildLesbar(bild: AnbieterBild): boolean {
  let bytes: Uint8Array;
  try {
    const binaer = atob(bild.data);
    bytes = new Uint8Array(binaer.length);
    for (let i = 0; i < binaer.length; i += 1) bytes[i] = binaer.charCodeAt(i);
  } catch {
    return false;
  }

  if (bild.media_type === "image/png") {
    const signatur = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 45 || !signatur.every((wert, i) => bytes[i] === wert)) return false;
    let position = 8;
    let breite = 0;
    let hoehe = 0;
    let hatIdat = false;
    let hatIend = false;
    while (position + 12 <= bytes.length) {
      const laenge = liesU32BE(bytes, position);
      const ende = position + 12 + laenge;
      if (ende > bytes.length) return false;
      const typ = ascii(bytes, position + 4, 4);
      if (position === 8 && (typ !== "IHDR" || laenge !== 13)) return false;
      if (typ === "IHDR") {
        breite = liesU32BE(bytes, position + 8);
        hoehe = liesU32BE(bytes, position + 12);
      } else if (typ === "IDAT") {
        hatIdat = true;
      } else if (typ === "IEND" && laenge === 0) {
        hatIend = true;
        break;
      }
      position = ende;
    }
    return hatIdat && hatIend && positiveDimensionen(breite, hoehe);
  }

  if (bild.media_type === "image/gif") {
    if (bytes.length < 14 || !["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6)) ||
        bytes[bytes.length - 1] !== 0x3b) return false;
    return positiveDimensionen(liesU16LE(bytes, 6), liesU16LE(bytes, 8));
  }

  if (bild.media_type === "image/jpeg") {
    if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
        bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return false;
    const sofMarker = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
      0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let position = 2;
    while (position + 3 < bytes.length) {
      if (bytes[position] !== 0xff) return false;
      while (position < bytes.length && bytes[position] === 0xff) position += 1;
      const marker = bytes[position];
      position += 1;
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (position + 1 >= bytes.length) return false;
      const laenge = liesU16BE(bytes, position);
      if (laenge < 2 || position + laenge > bytes.length) return false;
      if (sofMarker.has(marker)) {
        if (laenge < 7) return false;
        return positiveDimensionen(
          liesU16BE(bytes, position + 5),
          liesU16BE(bytes, position + 3),
        );
      }
      position += laenge;
    }
    return false;
  }

  if (bild.media_type === "image/webp") {
    if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" ||
        ascii(bytes, 8, 4) !== "WEBP" || liesU32LE(bytes, 4) + 8 > bytes.length) return false;
    let position = 12;
    while (position + 8 <= bytes.length) {
      const typ = ascii(bytes, position, 4);
      const laenge = liesU32LE(bytes, position + 4);
      const daten = position + 8;
      if (daten + laenge > bytes.length) return false;
      if (typ === "VP8X" && laenge >= 10) {
        return positiveDimensionen(
          1 + liesU24LE(bytes, daten + 4),
          1 + liesU24LE(bytes, daten + 7),
        );
      }
      if (typ === "VP8L" && laenge >= 5 && bytes[daten] === 0x2f) {
        return positiveDimensionen(
          1 + bytes[daten + 1] + ((bytes[daten + 2] & 0x3f) << 8),
          1 + (bytes[daten + 2] >> 6) + (bytes[daten + 3] << 2) +
            ((bytes[daten + 4] & 0x0f) << 10),
        );
      }
      if (typ === "VP8 " && laenge >= 10 && bytes[daten + 3] === 0x9d &&
          bytes[daten + 4] === 0x01 && bytes[daten + 5] === 0x2a) {
        return positiveDimensionen(
          liesU16LE(bytes, daten + 6) & 0x3fff,
          liesU16LE(bytes, daten + 8) & 0x3fff,
        );
      }
      position = daten + laenge + (laenge % 2);
    }
  }
  return false;
}

export type AnbieterKostenzaun = {
  erlaubt: boolean;
  konfigurationGueltig: boolean;
  limitUsdCent: number | null;
};

export function pruefeAnbieterKostenzaun(
  reservierungUsdCent: unknown,
  globalesLimitUsdCent: unknown,
  taskLimitUsdCent: unknown = undefined,
  taskLimitPflicht = false,
): AnbieterKostenzaun {
  const globalGueltig = typeof globalesLimitUsdCent === "number" &&
    Number.isFinite(globalesLimitUsdCent) &&
    globalesLimitUsdCent > 0 &&
    globalesLimitUsdCent <= ANBIETER_REQUEST_MAX_USD_CENT;
  const taskFehlt = taskLimitUsdCent === undefined || taskLimitUsdCent === null;
  const taskGueltig = taskFehlt
    ? !taskLimitPflicht
    : typeof taskLimitUsdCent === "number" &&
      Number.isFinite(taskLimitUsdCent) &&
      taskLimitUsdCent > 0 &&
      globalGueltig &&
      taskLimitUsdCent <= globalesLimitUsdCent;
  const reservierungGueltig = typeof reservierungUsdCent === "number" &&
    Number.isFinite(reservierungUsdCent) && reservierungUsdCent > 0;

  if (!globalGueltig || !taskGueltig || !reservierungGueltig) {
    return {
      erlaubt: false,
      konfigurationGueltig: globalGueltig && taskGueltig && reservierungGueltig,
      limitUsdCent: null,
    };
  }

  const limitUsdCent = taskFehlt
    ? globalesLimitUsdCent
    : Math.min(globalesLimitUsdCent, taskLimitUsdCent as number);
  return {
    erlaubt: reservierungUsdCent <= limitUsdCent,
    konfigurationGueltig: true,
    limitUsdCent,
  };
}

export function liesAnbieterRequestTimeoutMs(wert: unknown): number | null {
  return typeof wert === "number" && Number.isInteger(wert) && wert >= 1 &&
      wert <= ANBIETER_REQUEST_TIMEOUT_MAX_MS
    ? wert
    : null;
}

export function schaetzeAnbieterEingabeTokens(
  modell: string,
  system: string,
  nutzertext: string,
  maxTokens: number,
  schema: Record<string, unknown> | null,
  bilder: AnbieterBild[] = [],
): number {
  let bildTokens = 0;
  if (bilder.length) {
    const jeBild = anbieterBildTokenMax(modell);
    const erlaubteTypen = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    const base64Form = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    const gesamtZeichen = bilder.reduce((summe, bild) =>
      summe + (typeof bild?.data === "string" ? bild.data.length : 0), 0);
    if (jeBild === null || bilder.length > ANBIETER_BILD_MAX_ANZAHL ||
        gesamtZeichen > ANBIETER_BILD_BASE64_MAX_ZEICHEN_GESAMT ||
        bilder.some((bild) =>
          !bild || !erlaubteTypen.has(bild.media_type) ||
          typeof bild.data !== "string" || !bild.data ||
          !base64Form.test(bild.data) || !anbieterBildLesbar(bild))) {
      return Number.POSITIVE_INFINITY;
    }
    bildTokens = bilder.length * jeBild;
  }

  const koerper = baueAnbieterKoerper(
    modell,
    system,
    nutzertext,
    maxTokens,
    schema,
    /* Base64 ist Bildtransport, kein Texttoken. Fuer die Textobergrenze bleibt
       die komplette Nachrichtenstruktur erhalten, nur die bereits separat
       zum Vision-Maximum reservierten Binaerdaten werden geleert. */
    bilder.map((bild) => ({ ...bild, data: "" })),
  );
  const bytes = new TextEncoder().encode(JSON.stringify(koerper)).length;
  /* Keine Durchschnittsannahme wie bytes/3: Ein Texttoken muss mindestens ein
     Eingabebyte tragen, daher sind UTF-8-Bytes die konservative Obergrenze fuer
     den gesendeten Text. 4096 weitere Tokens reservieren Anbieter-Huelle und
     interne Struktur, die nicht im JSON-Koerper sichtbar sind. */
  return bytes + ANBIETER_INTERNE_TOKEN_RESERVE + bildTokens;
}
