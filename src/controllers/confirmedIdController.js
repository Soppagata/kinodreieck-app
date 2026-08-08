/* Verknüpfte UI-Zustände dürfen nie den Promise eines asynchronen Adds als ID
   übernehmen. Erst eine bestätigte, nichtleere String-ID erreicht den
   Folgeschritt; dessen bestätigtes false hält den Aufruf ebenfalls offen. */
export async function mitBestaetigterStringId(erzeugeId, uebernehmeId) {
  const id = await erzeugeId();
  if (typeof id !== "string" || !id) return null;
  const ok = await uebernehmeId(id);
  return ok === false ? null : id;
}
