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

export function istMasterUngesichert(herkunft, exportStand) {
  return !!(herkunft && herkunft.typ === "storage"
    && Number.isFinite(herkunft.zeit) && herkunft.zeit > (Number(exportStand) || 0));
}

export function istArtikelUngesichert(liste, gespeichertAm, exportStand) {
  if (!Array.isArray(liste) || !liste.length) return false;
  /* Ein historisches Array ohne Revision darf nie still als gesichert gelten.
     Der Artikelcontroller migriert es beim Laden; bis dahin bleibt die Anzeige
     bewusst konservativ. */
  if (!Number.isFinite(gespeichertAm) || gespeichertAm <= 0) return true;
  return gespeichertAm > (Number(exportStand) || 0);
}
