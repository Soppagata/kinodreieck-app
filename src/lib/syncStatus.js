import { T } from "./tokens.js";

export function syncStatusTeile(status) {
  if (!status?.configured) return [];
  const teile = [];
  const add = (text, kritisch = false) => teile.push({ text,
    farbe: kritisch ? T.gefahr : T.wolfram,
    bg: kritisch ? "rgba(217,106,90,0.14)" : "rgba(227,166,59,0.14)" });
  if (status.conflict?.length) add("Konflikt", true);
  if (status.zuGross?.length) add("Speichergrenze erreicht", true);
  if (status.schemaVeraltet?.length) add("Speichern fehlgeschlagen", true);
  if (status.pending?.length) add("ausstehend " + status.pending.length);
  if (status.stale?.length) add("nicht aktuell");
  if (!teile.length) teile.push({ text: "synchron", farbe: T.ok, bg: "rgba(111,206,143,0.12)" });
  return teile;
}

export function syncStatusAnzeige(status) { return syncStatusTeile(status)[0] || null; }
