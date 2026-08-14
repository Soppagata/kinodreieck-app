function roherWertStabileId(eintrag) {
  if (typeof eintrag === "number" || typeof eintrag === "string") {
    return eintrag;
  }
  if (!eintrag || typeof eintrag !== "object" || Array.isArray(eintrag)) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(eintrag, "id")) {
    return eintrag.id;
  }
  return null;
}

export function kanonischeStabileId(eintrag) {
  const wert = roherWertStabileId(eintrag);
  if (typeof wert === "number" && Number.isFinite(wert)) {
    return String(wert);
  }
  if (typeof wert === "string") {
    const k = wert.trim();
    return k.length ? k : null;
  }
  return null;
}

export function analysiereAuswaehlbareIds(eintraege) {
  const auswahl = Array.isArray(eintraege) ? eintraege : [];
  const vorkommen = new Map();
  const doppelteIds = new Set();
  let ungueltigeAnzahl = 0;

  for (const eintrag of auswahl) {
    const id = kanonischeStabileId(eintrag);
    if (!id) {
      ungueltigeAnzahl += 1;
      continue;
    }
    vorkommen.set(id, (vorkommen.get(id) || 0) + 1);
    if (vorkommen.get(id) > 1) {
      doppelteIds.add(id);
    }
  }

  const auswaehlbareIds = new Set();
  for (const [id, anzahl] of vorkommen.entries()) {
    if (anzahl === 1) {
      auswaehlbareIds.add(id);
    }
  }

  return {
    auswaehlbareIds,
    doppelteIds,
    ungueltigeAnzahl,
  };
}

export function schalteAuswahlUm(auswahlSet, eintrag, auswaehlbareIds) {
  const aktuell = new Set(auswahlSet instanceof Set ? auswahlSet : []);
  const erlaubteIds = auswaehlbareIds instanceof Set ? auswaehlbareIds : new Set();
  const id = kanonischeStabileId(eintrag);
  if (!id || !erlaubteIds.has(id)) {
    return aktuell;
  }
  if (aktuell.has(id)) {
    aktuell.delete(id);
  } else {
    aktuell.add(id);
  }
  return aktuell;
}

export function bereinigeAuswahl(auswahlSet, auswaehlbareIds) {
  const erlaubteIds = auswaehlbareIds instanceof Set ? auswaehlbareIds : new Set();
  const bereinigt = new Set();
  for (const rohId of auswahlSet instanceof Set ? auswahlSet : []) {
    const id = kanonischeStabileId(rohId);
    if (id && erlaubteIds.has(id)) {
      bereinigt.add(id);
    }
  }
  return bereinigt;
}

function bereinigeWhitespace(wert) {
  return String(wert).replace(/\s+/g, " ").trim();
}

export function ausgewaehlteSichtbareEintraege(sichtbareEintraege, auswahlSet, auswaehlbareIds) {
  const sichtbare = Array.isArray(sichtbareEintraege) ? sichtbareEintraege : [];
  const bereinigt = bereinigeAuswahl(auswahlSet, auswaehlbareIds);
  const bereits = new Set();
  const treffer = [];

  for (const eintrag of sichtbare) {
    const id = kanonischeStabileId(eintrag);
    if (!id || !bereinigt.has(id) || bereits.has(id)) {
      continue;
    }
    bereits.add(id);
    treffer.push(eintrag);
  }
  return treffer;
}

export function erstelleLoeschSnapshot(sichtbareEintraege, auswahlSet, auswaehlbareIds) {
  const globaleAuswahl = bereinigeAuswahl(auswahlSet, auswaehlbareIds);
  const sichtbareAuswahl = ausgewaehlteSichtbareEintraege(
    sichtbareEintraege, globaleAuswahl, auswaehlbareIds,
  );
  const ziele = sichtbareAuswahl.map((eintrag) => {
    const titel = bereinigeWhitespace(eintrag?.titel || "Ohne Titel") || "Ohne Titel";
    const hatJahr = eintrag?.jahr !== undefined && eintrag?.jahr !== null
      && String(eintrag.jahr).trim() !== "";
    return Object.freeze({
      id: kanonischeStabileId(eintrag),
      titel,
      jahr: hatJahr ? bereinigeWhitespace(eintrag.jahr) : "",
    });
  });
  return Object.freeze({
    ids: Object.freeze(ziele.map((ziel) => ziel.id)),
    ziele: Object.freeze(ziele),
    verborgeneAnzahl: Math.max(0, globaleAuswahl.size - ziele.length),
  });
}

/* Der einzige weiche Masterwechsel: exakt die bestätigten Ziele verschwinden,
   während Reihenfolge und Objektidentität jedes Nichtziels erhalten bleiben. */
export function istErwarteteLoeschProjektion(alterMaster, neuerMaster, zielIds) {
  if (!Array.isArray(alterMaster) || !Array.isArray(neuerMaster) || !Array.isArray(zielIds)
      || zielIds.length === 0) return false;
  const ziele = new Set();
  for (const rohId of zielIds) {
    const id = kanonischeStabileId(rohId);
    if (!id || ziele.has(id)) return false;
    ziele.add(id);
  }
  const gesehen = new Set();
  let neuerIndex = 0;
  for (const eintrag of alterMaster) {
    const id = kanonischeStabileId(eintrag);
    if (id && ziele.has(id)) {
      if (gesehen.has(id)) return false;
      gesehen.add(id);
      continue;
    }
    if (neuerMaster[neuerIndex] !== eintrag) return false;
    neuerIndex += 1;
  }
  return gesehen.size === ziele.size && neuerIndex === neuerMaster.length;
}

export function erstelleTitelliste(sichtbareEintraege, auswahlSet, auswaehlbareIds) {
  const sichtbareAuswahl = ausgewaehlteSichtbareEintraege(sichtbareEintraege, auswahlSet, auswaehlbareIds);
  const zeilen = [];

  for (const eintrag of sichtbareAuswahl) {
    const titel = bereinigeWhitespace(eintrag?.titel || "Ohne Titel") || "Ohne Titel";

    const hatJahr = eintrag?.jahr !== undefined && eintrag?.jahr !== null && String(eintrag.jahr).trim() !== "";
    const jahr = hatJahr ? bereinigeWhitespace(eintrag.jahr) : "";
    zeilen.push(hatJahr ? `${titel} (${jahr})` : titel);
  }

  return zeilen.join("\n");
}
