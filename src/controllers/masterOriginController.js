/* Jede lokale Mastermutation ist ein neuer Storage-Stand. Die ursprüngliche
   Quelle bleibt nur als Basisbeleg erhalten; sie darf den Backup-Wächter nicht
   durch einen weitergetragenen typ:"manuell"/"demo" umgehen. */
export function naechsteLokaleMasterHerkunft(vorher, jetzt = Date.now()) {
  let basis = vorher?.basis;
  if (!basis && (vorher?.typ === "demo" || vorher?.typ === "bundled")) basis = "Demo-Liste";
  if (!basis && vorher?.typ === "manuell") basis = "Manueller Import";
  return {
    typ: "storage",
    zeit: jetzt,
    ...(basis ? { basis } : {}),
  };
}
