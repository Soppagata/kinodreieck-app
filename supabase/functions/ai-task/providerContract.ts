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

export function schaetzeAnbieterEingabeTokens(
  modell: string,
  system: string,
  nutzertext: string,
  maxTokens: number,
  schema: Record<string, unknown> | null,
  bilder: AnbieterBild[] = [],
): number {
  const koerper = baueAnbieterKoerper(
    modell,
    system,
    nutzertext,
    maxTokens,
    schema,
    bilder,
  );
  /* Base64 ist Transport, nicht Modelltext. Würden seine Zeichen als Token
     gezählt, reservierte ein 500-KB-Foto mehr als 160.000 Tokens. Für Bilder
     gilt stattdessen eine konservative feste Obergrenze; tatsächliche Tokens
     ersetzt der Anbieter nach dem Lauf ohnehin im Kostenprotokoll. */
  const schaetzKoerper = bilder.length
    ? JSON.parse(JSON.stringify(koerper, (key, wert) => key === "data" ? "" : wert))
    : koerper;
  const bytes = new TextEncoder().encode(JSON.stringify(schaetzKoerper)).length;
  /* Drei UTF-8-Bytes je Token plus 300 Token Sicherheitsaufschlag ist bewusst
     konservativ. Entscheidend ist, dass die Schätzung alles Gesendete umfasst. */
  return Math.ceil(bytes / 3) + 300 + bilder.length * 1600;
}
