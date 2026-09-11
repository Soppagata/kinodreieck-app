/* Der Browser bestätigt den Download nicht, aber `click()` ist die letzte
   synchrone Fehlergrenze. Erst wenn sie ohne Ausnahme zurückkehrt, darf der
   Gesamt-Export beide Sicherungsstände markieren. */
export function starteGesamtBackupDownload(anchor, markiereExport, exportStaende = {}) {
  anchor.click();
  for (const feld of ["master", "artikel"]) {
    if (Number.isFinite(exportStaende?.[feld])) markiereExport(feld, exportStaende[feld]);
  }
}

/* Einzeldateien markieren ebenfalls erst nach dem bestätigten Browser-Klick
   und ausschließlich die Revision, die im erzeugten Blob sichtbar war. */
export function starteEinzelExportDownload(anchor, markiereExport, feld, enthaltenerStand) {
  anchor.click();
  if (Number.isFinite(enthaltenerStand)) markiereExport(feld, enthaltenerStand);
}

/* Ein erfolgreicher Konto-Commit ist ein bestätigter automatischer Speicherweg,
   aber keine unabhängige Sicherheitskopie. Für den Export-Wächter zählt er nur
   dann, wenn genau dieser Topf weder aussteht noch an einer Fehlergrenze hängt. */
export function istKontoTopfBestaetigt(key, syncStatus, kontoSpeicherAktiv = false) {
  if (!kontoSpeicherAktiv || syncStatus?.configured !== true) return false;
  const sperrfelder = ["pending", "conflict", "stale", "zuGross", "schemaVeraltet"];
  if (!sperrfelder.every((feld) => Array.isArray(syncStatus?.[feld]))) return false;
  return !sperrfelder.some((feld) => syncStatus[feld].includes(key));
}

export function istMasterUngesichert(herkunft, exportStand, kontoBestaetigt = false) {
  return kontoBestaetigt !== true && !!(herkunft && herkunft.typ === "storage"
    && Number.isFinite(herkunft.zeit) && herkunft.zeit > (Number(exportStand) || 0));
}

export function istArtikelUngesichert(liste, gespeichertAm, exportStand, kontoBestaetigt = false) {
  if (!Array.isArray(liste) || !liste.length) return false;
  if (kontoBestaetigt === true) return false;
  /* Ein historisches Array ohne Revision darf nie still als gesichert gelten.
     Der Artikelcontroller migriert es beim Laden; bis dahin bleibt die Anzeige
     bewusst konservativ. */
  if (!Number.isFinite(gespeichertAm) || gespeichertAm <= 0) return true;
  return gespeichertAm > (Number(exportStand) || 0);
}
