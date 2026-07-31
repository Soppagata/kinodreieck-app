/* Pure Anbietergrenze: Exakt derselbe Körper dient der Kostenreservierung und
   dem späteren Request. Das Modul kennt weder Deno, Secrets noch Netzwerk. */

export function baueAnbieterKoerper(
  modell: string,
  system: string,
  nutzertext: string,
  maxTokens: number,
  schema: Record<string, unknown> | null,
): Record<string, unknown> {
  const koerper: Record<string, unknown> = {
    model: modell,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: nutzertext }],
  };
  if (schema) {
    koerper.output_config = { format: { type: "json_schema", schema } };
  }
  return koerper;
}

export function schaetzeAnbieterEingabeTokens(
  modell: string,
  system: string,
  nutzertext: string,
  maxTokens: number,
  schema: Record<string, unknown> | null,
): number {
  const koerper = baueAnbieterKoerper(
    modell,
    system,
    nutzertext,
    maxTokens,
    schema,
  );
  const bytes = new TextEncoder().encode(JSON.stringify(koerper)).length;
  /* Drei UTF-8-Bytes je Token plus 300 Token Sicherheitsaufschlag ist bewusst
     konservativ. Entscheidend ist, dass die Schätzung alles Gesendete umfasst. */
  return Math.ceil(bytes / 3) + 300;
}
