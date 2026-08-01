/* ================= Dienste-Anzeigefilter (Joyn-Fix, Etappe 1) =================
   Zentrale Filterfunktion für alle Stellen, die Streaming-Dienste als Badges
   oder Links rendern (badgeFuer in App, DienstBadges im StreamingTab, die
   drei FinderTab-Renderstellen). Konvention EXAKT wie `dienstOk` im
   StreamingTab: leere/fehlende Abo-Auswahl bedeutet "alles zeigen"; sonst
   bleiben nur Dienste übrig, die in der Auswahl enthalten sind — abgewählte
   Dienste (z. B. Joyn) taggen damit nirgends mehr.
   Bewusst NICHT angewendet: Katalog-Status-Zeile in den Einstellungen
   ("Quellen im Katalog") — das ist eine Statusanzeige über den Rohkatalog. */
export function sichtbareDienste(dienste, auswahl) {
  const liste = dienste || [];
  if (!auswahl || auswahl.length === 0) return liste;
  return liste.filter((d) => auswahl.includes(d));
}

const AMAZON_CHANNEL = /\s*\(Via (?:Amazon )?Prime\)\s*$/i;

/* Nur die kompakte Anzeige wird zusammengefasst. Filter, Links und geöffnete
   Details arbeiten weiterhin mit den unveränderten Katalognamen. */
export function gruppiereDienstBadges(dienste, { kompakt = false } = {}) {
  const gruppen = new Map();
  for (const roh of dienste || []) {
    const label = kompakt && AMAZON_CHANNEL.test(roh) ? "Amazon Channel" : roh;
    if (!gruppen.has(label)) gruppen.set(label, []);
    gruppen.get(label).push(roh);
  }
  return [...gruppen].map(([label, rohnamen]) => ({ label, rohnamen }));
}
