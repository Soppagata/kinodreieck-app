/* Stabiler, laufzeitfreier Vertrag des ai-task-Endpunkts.
   Dieses Modul kennt weder Supabase noch Deno noch den KI-Anbieter. Dadurch
   können Client-/Betriebstests Routing und Fehlercodes direkt prüfen, ohne
   Positionen oder Textfragmente aus index.ts als Ersatzvertrag zu verwenden. */

export const CODES = {
  UNAUTHENTICATED: "unauthenticated",
  FORBIDDEN: "forbidden",
  LIMIT: "limit",
  SERVER: "server",
  INVALID_RESPONSE: "invalid-response",
  AI_DISABLED: "ai-disabled",
  AI_REFUSED: "ai-refused",
  NOT_IMPLEMENTED: "not-implemented",
  AI_DUPLICATE: "ai-duplicate",
} as const;

export const STATUS: Readonly<Record<string, number>> = Object.freeze({
  [CODES.UNAUTHENTICATED]: 401,
  [CODES.FORBIDDEN]: 403,
  [CODES.LIMIT]: 429,
  [CODES.AI_DISABLED]: 503,
  [CODES.AI_REFUSED]: 422,
  [CODES.INVALID_RESPONSE]: 502,
  [CODES.NOT_IMPLEMENTED]: 501,
  [CODES.AI_DUPLICATE]: 409,
  [CODES.SERVER]: 500,
});

export const RESERVIERTE_AUFGABEN = Object.freeze([
  "health",
  "anbieter-modelle",
] as const);

/* Die später aktivierbare Produktfläche ist absichtlich eine geschlossene,
   geordnete Liste. Diagnosen und noch nicht gebaute Ideen gehören nicht dazu. */
export const NUTZER_AUFGABEN = Object.freeze([
  "intelligent-search",
  "profile-extract",
  "film-forecast",
  "filmwissen-synthese",
  "media-batch-extract",
  "blog-profile-extract",
] as const);

export const NOCH_NICHT_GEBAUTE_AUFGABEN = Object.freeze([
  "masterlist-enrichment",
] as const);

export const FUNCTION_CONTRACT_VERSION = "ai-task-v5";
const BUILD_VERSION_FORM = /^[A-Za-z0-9][A-Za-z0-9._-]{6,63}$/;

export function functionBuildVersion(wert: unknown): string {
  const kandidat = typeof wert === "string" ? wert.trim() : "";
  return BUILD_VERSION_FORM.test(kandidat) ? kandidat : "unversioned";
}

export type AufgabenRoute =
  | "health"
  | "anbieter-modelle"
  | "gebaut"
  | "geplant"
  | "unbekannt";

export function klassifiziereAufgabe(
  task: string,
  gebaut: boolean,
): AufgabenRoute {
  if (task === "health") return "health";
  if (task === "anbieter-modelle") return "anbieter-modelle";
  if (gebaut) return "gebaut";
  if (
    (NOCH_NICHT_GEBAUTE_AUFGABEN as readonly string[]).includes(task)
  ) return "geplant";
  return "unbekannt";
}

export type AnbieterVerbrauch = {
  modell?: string;
  inputTokens?: number;
  outputTokens?: number;
};

export class AufrufFehler extends Error {
  code: string;
  grund: string;
  verbrauch: AnbieterVerbrauch | null;

  constructor(
    code: string,
    grund: string,
    verbrauch: AnbieterVerbrauch | null = null,
  ) {
    super(grund);
    this.name = "AufrufFehler";
    this.code = code;
    this.grund = grund;
    this.verbrauch = verbrauch;
  }
}
