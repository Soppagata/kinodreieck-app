/* Automatischer Kontodownload nach Login: nur eindeutige, verlustfreie Fälle
   laufen ohne Assistent. Abweichende lokale Daten bleiben entscheidungspflichtig. */

const { kontoSicherAutomatischLaden } = await import("./src/services/uebernahme.js");

let ok = 0;
function check(name, value) {
  if (!value) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

function inventur(fall, stati) {
  return async () => ({
    ok: true,
    fall,
    lokaleWerte: { "kd:master": null },
    vorschau: stati.map((status) => ({ status })),
  });
}

{
  const calls = [];
  let geworfen = false;
  try {
    await kontoSicherAutomatischLaden("konto-A", {
      inventur: async () => ({ ok: false, erreichbar: false, fall: "beide-leer", vorschau: [] }),
      bestaetigen: () => calls.push("bestaetigen"),
    });
  } catch { geworfen = true; }
  check("Nicht erreichbare Konten werden niemals als leer bestätigt", geworfen && calls.length === 0);
}

{
  const calls = [];
  const ergebnis = await kontoSicherAutomatischLaden("konto-A", {
    inventur: inventur("nur-konto", ["nur-konto", "beide-leer"]),
    kontoLaden: async () => { calls.push("laden"); return { ok: true }; },
    bestaetigen: (id) => calls.push("bestaetigen:" + id),
  });
  check("Leeres Gerät lädt vorhandene Kontodaten direkt", ergebnis.automatisch
    && calls.join("|") === "laden|bestaetigen:konto-A");
}

{
  const calls = [];
  const ergebnis = await kontoSicherAutomatischLaden("konto-A", {
    inventur: inventur("beide-leer", ["beide-leer"]),
    bestaetigen: (id) => calls.push(id),
  });
  check("Zwei leere Bestände aktivieren den Kontospeicher ohne Zwischenfrage",
    ergebnis.grund === "beide-leer" && calls[0] === "konto-A");
}

{
  const calls = [];
  const ergebnis = await kontoSicherAutomatischLaden("konto-A", {
    inventur: inventur("beide-belegt", ["identisch", "beide-leer"]),
    pull: async () => { calls.push("pull"); return { ok: true }; },
    bestaetigen: () => calls.push("bestaetigen"),
  });
  check("Bitgleiche Bestände werden aktualisiert und danach aktiviert",
    ergebnis.grund === "identisch" && calls.join("|") === "pull|bestaetigen");
}

{
  const calls = [];
  const ergebnis = await kontoSicherAutomatischLaden("konto-A", {
    inventur: inventur("beide-belegt", ["unterschiedlich"]),
    kontoLaden: async () => { calls.push("laden"); return { ok: true }; },
    pull: async () => { calls.push("pull"); return { ok: true }; },
    bestaetigen: () => calls.push("bestaetigen"),
  });
  check("Abweichende Bestände werden niemals automatisch überschrieben",
    !ergebnis.automatisch && calls.length === 0);
}

{
  const calls = [];
  let geworfen = false;
  try {
    await kontoSicherAutomatischLaden("konto-A", {
      inventur: inventur("nur-konto", ["nur-konto"]),
      kontoLaden: async () => ({ ok: false }),
      bestaetigen: () => calls.push("bestaetigen"),
    });
  } catch { geworfen = true; }
  check("Fehlgeschlagener Download aktiviert den Kontospeicher nicht", geworfen && calls.length === 0);
}

console.log(`KONTO-AUTOLADEN-TEST BESTANDEN (${ok}/${ok})`);
