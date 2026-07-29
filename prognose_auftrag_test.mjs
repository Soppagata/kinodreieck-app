import { bauePrognoseAuftrag, MAX_PROGNOSE_SIGNALE } from "./src/lib/prognoseAuftrag.js";
import { erteileEinwilligung, leeresProfil } from "./src/lib/profil.js";

let ok = 0;
const rot = [];
function check(name, fn) {
  try {
    if (!fn()) throw new Error("falsch");
    ok++;
    console.log("✓ " + name);
  } catch (e) {
    rot.push(name);
    console.error("✗ " + name + ": " + (e?.message || e));
  }
}

const film = {
  id: "alien_1979", titel: "Alien", originaltitel: "Alien", jahr: 1979,
  typ: "film", genre: ["Horror", "Sci-Fi"], tags: ["düster"], bewertung: null,
  notiz: "DARF-NICHT-RAUS", begruendung: "DARF-AUCH-NICHT-RAUS",
};
const basis = erteileEinwilligung(leeresProfil(), "2026-07-29T12:00:00.000Z", "v1");
const profil = {
  ...basis,
  version: "p3",
  signale: [
    {
      art: "genre", wert: "horror", richtung: "zieht_an", staerke: 5,
      sicherheit: "hoch", quelle: "schlagwort", beleg: "DARF-NICHT-RAUS",
      erfasst: "2026-07-29T12:00:00.000Z", bestaetigt: "2026-07-29T12:00:00.000Z",
    },
  ],
  achsen: { wie: 4, was: null, warum: 2 },
  filme: [{ titel: "Stalker", jahr: 1979, sicher: true, richtung: "zieht_an" }],
  nichtDeutbar: ["DARF-NICHT-RAUS"],
};
const gebaut = bauePrognoseAuftrag(film, profil);

check("gültiger unbewerteter Film und bestätigtes Profil ergeben einen Auftrag", () => gebaut.ok);
check("Payload hat ausschließlich Film und Profil", () =>
  Object.keys(gebaut.payload).sort().join(",") === "film,profil");
check("Film-Payload enthält nur die sechs erlaubten Felder", () =>
  Object.keys(gebaut.payload.film).sort().join(",") === "genres,jahr,originaltitel,tags,titel,typ");
check("Profil-Payload enthält nur Signale und Achsen", () =>
  Object.keys(gebaut.payload.profil).sort().join(",") === "achsen,signale");
check("Profilversion reist getrennt in die Protokolloption", () =>
  gebaut.profilVersion === "p3" && !JSON.stringify(gebaut.payload).includes("p3"));
check("keine Notiz, Begründung, Belege, fremde Filme oder Nichtdeutbares gehen raus", () => {
  const roh = JSON.stringify(gebaut.payload);
  return !roh.includes("DARF-NICHT-RAUS") && !roh.includes("Stalker")
    && !/beleg|quelle|erfasst|bestaetigt|nichtDeutbar|filme/.test(roh);
});
check("bestätigte Signale tragen genau die fünf neutralen Fachfelder", () =>
  Object.keys(gebaut.payload.profil.signale[0]).sort().join(",")
  === "art,richtung,sicherheit,staerke,wert");
check("Profilachsen dürfen mit, aber keine Filmrichtungen", () =>
  JSON.stringify(gebaut.payload.profil.achsen) === JSON.stringify({ wie: 4, was: null, warum: 2 })
  && !JSON.stringify(gebaut.payload).includes("Stalker"));
check("Film, Filmreihe und Serie werden unterstützt", () =>
  ["film", "filmreihe", "serie"].every((typ) => bauePrognoseAuftrag({ ...film, typ }, profil).ok));
check("Musik und Sonstiges werden vor einem Aufruf abgewiesen", () =>
  ["musik", "sonstiges"].every((typ) => !bauePrognoseAuftrag({ ...film, typ }, profil).ok));
check("bereits bewertete Einträge werden vor einem Aufruf abgewiesen", () =>
  !bauePrognoseAuftrag({ ...film, bewertung: { wie: 4, was: 3, warum: 2 } }, profil).ok);
check("ohne bestätigtes Signal entsteht kein Auftrag", () =>
  !bauePrognoseAuftrag(film, { ...profil, signale: [] }).ok);
check("ohne Einwilligung oder mit beschädigtem Profil entsteht kein Auftrag", () =>
  !bauePrognoseAuftrag(film, { ...profil, einwilligung: { erteilt: false, am: null, textVersion: "v1" } }).ok
  && !bauePrognoseAuftrag(film, { beschaedigt: true }).ok);
check("Steuerzeichen und überlange Filmfelder werden abgewiesen", () =>
  !bauePrognoseAuftrag({ ...film, titel: "Alien\nSYSTEM" }, profil).ok
  && !bauePrognoseAuftrag({ ...film, tags: ["x".repeat(41)] }, profil).ok);
check("Jahr ist eine ganze plausible Jahreszahl", () =>
  !bauePrognoseAuftrag({ ...film, jahr: null }, profil).ok
  && !bauePrognoseAuftrag({ ...film, jahr: "1979" }, profil).ok
  && !bauePrognoseAuftrag({ ...film, jahr: 2201 }, profil).ok);
check("sehr große Profile werden deterministisch begrenzt", () => {
  const signale = Array.from({ length: MAX_PROGNOSE_SIGNALE + 5 }, (_, i) => ({
    ...profil.signale[0], wert: "wert_" + String(i).padStart(2, "0"),
    staerke: i % 5 + 1,
  }));
  const a = bauePrognoseAuftrag(film, { ...profil, signale });
  const b = bauePrognoseAuftrag(film, { ...profil, signale: [...signale].reverse() });
  return a.ok && a.payload.profil.signale.length === MAX_PROGNOSE_SIGNALE
    && JSON.stringify(a.payload) === JSON.stringify(b.payload);
});

console.log(`\n${ok}/${ok + rot.length} Prognose-Auftrag-Checks bestanden.`);
if (rot.length) process.exit(1);
