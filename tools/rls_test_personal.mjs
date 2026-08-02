#!/usr/bin/env node
/* RLS-Negativtest für kd_personal, kd_catalog, kd_quellen und die KI-Tabellen
   kd_ai_log/kd_ai_limits — läuft gegen die
   ECHTE Datenbank.
   ============================================================================
   Bewusst NICHT Teil von `npm test`: braucht ein erreichbares Supabase-Projekt
   und zwei echte Testaccounts. Vor jeder Migration ausführen, die RLS berührt.

   Konfiguration ausschließlich über Umgebungsvariablen — nie in Dateien, nie im
   Repo, nie im Chat:

     KD_SB_URL=https://<projekt>.supabase.co \
     KD_SB_ANON=<publishable-key> \
     KD_TESTA_USER=testa KD_TESTA_PASS=... \
     KD_TESTB_USER=testb KD_TESTB_PASS=... \
     node tools/rls_test_personal.mjs

   Beide Testaccounts legt Max vorher im Dashboard an (Auto Confirm User),
   Adressform <benutzer>@login.kinodreieck.at.

   Das Skript räumt seine eigenen Testzeilen am Ende wieder weg (nutzt kdp_del).
   Exit-Code != 0 bei jeder Abweichung.
   ============================================================================ */

const URL = (process.env.KD_SB_URL || "").trim().replace(/\/+$/, "");
const ANON = (process.env.KD_SB_ANON || "").trim();
const A_USER = (process.env.KD_TESTA_USER || "testa").trim();
const A_PASS = process.env.KD_TESTA_PASS || "";
const B_USER = (process.env.KD_TESTB_USER || "testb").trim();
const B_PASS = process.env.KD_TESTB_PASS || "";
const MAIL_DOMAIN = (process.env.KD_MAIL_DOMAIN || "login.kinodreieck.at").trim();

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(URL) || !ANON || !A_PASS || !B_PASS) {
  console.error("Konfiguration unvollständig. Benötigt: KD_SB_URL, KD_SB_ANON, KD_TESTA_PASS, KD_TESTB_PASS.");
  console.error("(Optional: KD_TESTA_USER, KD_TESTB_USER, KD_MAIL_DOMAIN)");
  process.exit(2);
}

/* Der RLS-Test darf keinen echten Testkonto-Topf überschreiben oder beim
   Cleanup löschen. Nach der Anmeldung wird deshalb aus dieser sicheren
   Teilmenge ein Key gewählt, der bei A UND B nachweislich noch nicht
   existiert. Gibt es keinen, stoppt der Lauf vor dem ersten Schreibzugriff. */
const TESTKEY_KANDIDATEN = [
  "kd:vokabular",
  "kd:filter-kino",
  "kd:filter-streaming",
  "kd:filter-mediathek",
  "kd:zeitgrenze",
  "kd:achievements",
];
let TESTKEY = null;
const FREMDKEY = "kd:boeser-topf";  // steht NICHT in der Key-Allowlist
/* Etappe 7: Der Profil-Topf wird EINZELN geprueft, nicht stellvertretend ueber
   TESTKEY. Grund: Er ist der juengste Eintrag der Key-Whitelist, und deren
   CHECK-Constraint ist die Stelle, deren Verfehlen laut Migrationskopf
   "jeden Profil-Sync still und endgueltig" bricht -- der Treiber behandelt
   23514 als terminal, ohne Wiederholung. Nur ein scharfer Lauf gegen die
   ECHTE Datenbank belegt, dass die Migration wirklich gelaufen ist. */
const PROFILKEY = "kd:geschmacksprofil";

let ok = 0; const fehler = [];
function pruefe(name, bedingung, detail = "") {
  if (bedingung) { ok++; console.log("✓ " + name); }
  else { fehler.push(name + (detail ? " — " + detail : "")); console.log("✗ " + name + (detail ? " — " + detail : "")); }
}

function headers(token, { body = false, prefer = null } = {}) {
  const h = { apikey: ANON };
  if (/^eyJ/.test(ANON)) h.Authorization = "Bearer " + ANON;
  if (token) h.Authorization = "Bearer " + token;
  if (body) h["Content-Type"] = "application/json";
  if (prefer) h.Prefer = prefer;
  return h;
}

async function rest(method, pfad, { token = null, body = null, prefer = null } = {}) {
  const res = await fetch(URL + "/rest/v1" + pfad, {
    method, headers: headers(token, { body: !!body, prefer }),
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch { /* 204 */ }
  return { status: res.status, ok: res.ok, data };
}

async function login(benutzer, passwort) {
  const res = await fetch(URL + "/auth/v1/token?grant_type=password", {
    method: "POST", headers: headers(null, { body: true }),
    body: JSON.stringify({ email: benutzer + "@" + MAIL_DOMAIN, password: passwort }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) {
    console.error(`Login für ${benutzer} fehlgeschlagen (HTTP ${res.status}).`, data?.error_description || data?.msg || "");
    process.exit(2);
  }
  return { token: data.access_token, id: data.user?.id };
}

const A = await login(A_USER, A_PASS);
const B = await login(B_USER, B_PASS);
pruefe("Zwei getrennte Testaccounts eingeloggt", !!A.id && !!B.id && A.id !== B.id);

for (const kandidat of TESTKEY_KANDIDATEN) {
  const [standA, standB] = await Promise.all([
    rest("GET", `/kd_personal?key=eq.${encodeURIComponent(kandidat)}&select=key&limit=1`, { token: A.token }),
    rest("GET", `/kd_personal?key=eq.${encodeURIComponent(kandidat)}&select=key&limit=1`, { token: B.token }),
  ]);
  const aLeer = standA.status === 200 && Array.isArray(standA.data) && standA.data.length === 0;
  const bLeer = standB.status === 200 && Array.isArray(standB.data) && standB.data.length === 0;
  if (aLeer && bLeer) { TESTKEY = kandidat; break; }
  if (standA.status !== 200 || !Array.isArray(standA.data)
    || standB.status !== 200 || !Array.isArray(standB.data)) {
    const fehlerInfo = (antwort) => ({
      status: antwort.status,
      code: antwort.data?.code || null,
      message: antwort.data?.message || null,
    });
    console.error(
      "RLS-Testtopf konnte nicht sicher als frei belegt werden. Kein Schreibtest gestartet.",
      JSON.stringify({ accountA: fehlerInfo(standA), accountB: fehlerInfo(standB) }),
    );
    process.exit(2);
  }
}
if (!TESTKEY) {
  console.error("Kein gemeinsamer freier RLS-Testtopf vorhanden. Bestehende Kontodaten bleiben unangetastet.");
  process.exit(2);
}

/* --- T1/T2: anon darf gar nichts --------------------------------------- */
const t1 = await rest("GET", "/kd_personal?select=key&limit=1");
pruefe("T1 anon LESEN wird abgewiesen (kein 200)", t1.status === 401 || t1.status === 403,
  "HTTP " + t1.status + (t1.status === 200 ? " — LECK: anon sieht Zeilen!" : ""));

const t2 = await rest("POST", "/kd_personal", { body: { key: TESTKEY, value: "x" } });
pruefe("T2 anon SCHREIBEN wird abgewiesen", t2.status === 401 || t2.status === 403, "HTTP " + t2.status);

/* --- T3/T7: A schreibt und liest eigene Zeilen -------------------------- */
const probeId = crypto.randomUUID();
const wertA = JSON.stringify([{ wort: "rls-test-a", probeId }]);
const t7 = await rest("POST", "/kd_personal", {
  token: A.token, body: { key: TESTKEY, value: wertA }, prefer: "return=representation",
});
const zeileA = Array.isArray(t7.data) ? t7.data[0] : null;
const testAAngelegt = (t7.status === 201 || t7.status === 200)
  && zeileA?.account_id === A.id
  && zeileA?.key === TESTKEY
  && zeileA?.value === wertA
  && zeileA?.revision === 1;
pruefe("T7 A legt eigene Zeile OHNE account_id an (Server setzt sie)",
  testAAngelegt,
  "HTTP " + t7.status + " account_id=" + (zeileA?.account_id || "?"));

const t3 = await rest("GET", `/kd_personal?key=eq.${encodeURIComponent(TESTKEY)}&select=key,value,revision`, { token: A.token });
pruefe("T3 A liest die eigene Zeile", t3.ok && Array.isArray(t3.data) && t3.data[0]?.value === wertA);

/* --- T4: A sieht nichts von B ------------------------------------------ */
const wertB = JSON.stringify([{ wort: "rls-test-b", probeId }]);
const anlageB = await rest("POST", "/kd_personal", {
  token: B.token, body: { key: TESTKEY, value: wertB }, prefer: "return=representation",
});
const zeileB = Array.isArray(anlageB.data) ? anlageB.data[0] : null;
const testBAngelegt = (anlageB.status === 201 || anlageB.status === 200)
  && zeileB?.account_id === B.id
  && zeileB?.key === TESTKEY
  && zeileB?.value === wertB
  && zeileB?.revision === 1;
const t4 = await rest("GET", `/kd_personal?account_id=eq.${B.id}&select=key,value`, { token: A.token });
pruefe("T4 A liest B: 200 mit LEERER Menge (RLS filtert, kein Leck)",
  testBAngelegt && t4.status === 200 && Array.isArray(t4.data) && t4.data.length === 0,
  "HTTP " + t4.status + " rows=" + (Array.isArray(t4.data) ? t4.data.length : "?"));

/* --- T5: A schreibt für B ---------------------------------------------- */
const t5 = await rest("POST", "/kd_personal", {
  token: A.token, body: { account_id: B.id, key: "kd:merkliste", value: "[]" },
});
pruefe("T5 A schreibt mit gespoofter account_id=B → abgewiesen",
  t5.status === 403 || t5.status === 401, "HTTP " + t5.status + (t5.status < 300 ? " — LECK: Fremdschreiben möglich!" : ""));

/* --- T6: A patcht B-Zeile ---------------------------------------------- */
const t6 = await rest("PATCH", `/kd_personal?account_id=eq.${B.id}&key=eq.${encodeURIComponent(TESTKEY)}`, {
  token: A.token, body: { value: "[]" }, prefer: "return=representation",
});
pruefe("T6 A patcht B-Zeile → 0 Zeilen betroffen",
  t6.status === 200 && Array.isArray(t6.data) && t6.data.length === 0, "HTTP " + t6.status);
const t6b = await rest("GET", `/kd_personal?key=eq.${encodeURIComponent(TESTKEY)}&select=value`, { token: B.token });
pruefe("T6b B-Zeile ist unverändert", t6b.ok && t6b.data?.[0]?.value === wertB);

/* --- T8: revision-Spoof ------------------------------------------------- */
const t8 = await rest("PATCH", `/kd_personal?key=eq.${encodeURIComponent(TESTKEY)}&revision=eq.1`, {
  token: A.token, body: { value: wertA + " ", revision: 999 }, prefer: "return=representation",
});
pruefe("T8 revision-Spoof wirkungslos (Server zählt auf 2)",
  t8.ok && Array.isArray(t8.data) && t8.data[0]?.revision === 2,
  "revision=" + (t8.data?.[0]?.revision ?? "?"));

/* --- T8b: optimistische Sperre ------------------------------------------ */
const t8b = await rest("PATCH", `/kd_personal?key=eq.${encodeURIComponent(TESTKEY)}&revision=eq.1`, {
  token: A.token, body: { value: wertA + " veraltet" }, prefer: "return=representation",
});
pruefe("T8b PATCH mit veralteter revision trifft 0 Zeilen (Konfliktsignal)",
  t8b.status === 200 && Array.isArray(t8b.data) && t8b.data.length === 0);

/* --- T9: Größen-Guard ---------------------------------------------------- */
const zuGross = "x".repeat(1048577);
const t9 = await rest("POST", "/kd_personal", { token: A.token, body: { key: "kd:artikel", value: zuGross } });
pruefe("T9 Wert über 1 MiB wird abgelehnt (CHECK 23514)",
  t9.status === 400 && /23514|kd_personal_value_max/.test(JSON.stringify(t9.data || {})),
  "HTTP " + t9.status);

/* --- T10: fremder key ---------------------------------------------------- */
const t10 = await rest("POST", "/kd_personal", { token: A.token, body: { key: FREMDKEY, value: "x" } });
pruefe("T10 Nicht erlaubter Topf-Name wird abgelehnt (CHECK 23514)",
  t10.status === 400 && /23514|kd_personal_key_erlaubt/.test(JSON.stringify(t10.data || {})),
  "HTTP " + t10.status);

/* --- T10b-T10d: Profil-Topf (Etappe 7) ----------------------------------
   Der Topf ist neu in der Key-Whitelist (Migration 20260727210000). Diese
   drei Proben belegen gegen die ECHTE Datenbank, dass die Migration gelaufen
   ist UND die Kontotrennung auch fuer den persoenlichsten Topf der App gilt.
   Schlaegt T10b fehl, fehlt die Migration -- dann bricht jeder Profil-Sync
   mit 23514, und zwar terminal (der Treiber wiederholt bei diesem Code
   nicht). */
/* Der Test muss beliebig oft gegen dieselben Konten laufen können. Ein früherer
   erfolgreicher Lauf oder ein echter UI-Test kann den Profil-Topf bereits
   angelegt haben; ein blindes INSERT endet dann korrekt mit 409 und wurde
   bislang fälschlich als fehlende Migration gemeldet. Vorhandene Profildaten
   dürfen wir weder überschreiben noch beim Cleanup löschen. */
const profilProbeWert = JSON.stringify({
  format: 1,
  version: "p0",
  erstellt: null,
  geaendert: null,
  einwilligung: null,
  signale: [],
  offen: [],
  achsen: { wie: null, was: null, warum: null },
  filme: [],
  nichtDeutbar: [],
  _rlsProbe: crypto.randomUUID(),
});
const t10Vorher = await rest(
  "GET",
  `/kd_personal?account_id=eq.${A.id}&key=eq.${encodeURIComponent(PROFILKEY)}&select=account_id,key&limit=2`,
  { token: A.token },
);
const profilVorherLesbar = t10Vorher.status === 200
  && Array.isArray(t10Vorher.data)
  && t10Vorher.data.length <= 1;
const profilSchonDa = t10Vorher.status === 200
  && Array.isArray(t10Vorher.data)
  && t10Vorher.data.length === 1
  && t10Vorher.data[0]?.account_id === A.id
  && t10Vorher.data[0]?.key === PROFILKEY;
let profilAnlageVersucht = false;
let t10b = t10Vorher;
if (profilVorherLesbar && !profilSchonDa) {
  profilAnlageVersucht = true;
  t10b = await rest("POST", "/kd_personal", {
    token: A.token,
    body: { key: PROFILKEY, value: profilProbeWert },
    prefer: "return=representation",
  });
}
const profilZeile = Array.isArray(t10b.data) ? t10b.data[0] : null;
const profilVomTestAngelegt = !profilSchonDa
  && (t10b.status === 201 || t10b.status === 200)
  && profilZeile?.account_id === A.id
  && profilZeile?.key === PROFILKEY
  && profilZeile?.value === profilProbeWert;
const profilABelegt = profilSchonDa || profilVomTestAngelegt;
pruefe("T10b Profil-Topf ist in der Key-Whitelist (Migration Etappe 7 gelaufen)",
  profilABelegt,
  profilSchonDa
    ? "bereits vorhanden und für Konto A lesbar"
    : "HTTP " + t10b.status + (t10b.status === 400 ? " — MIGRATION FEHLT" : ""));

const t10c = await rest(
  "GET",
  `/kd_personal?account_id=eq.${A.id}&key=eq.${encodeURIComponent(PROFILKEY)}&select=account_id,key`,
  { token: B.token },
);
pruefe("T10c Konto B sieht das Profil von Konto A NICHT",
  profilABelegt && t10c.status === 200 && Array.isArray(t10c.data) && t10c.data.length === 0,
  "HTTP " + t10c.status + ", Zeilen " + (Array.isArray(t10c.data) ? t10c.data.length : "?"));

const t10d = await rest(
  "GET",
  `/kd_personal?account_id=eq.${A.id}&key=eq.${encodeURIComponent(PROFILKEY)}&select=account_id,key`,
);
pruefe("T10d anon sieht das Profil nicht",
  profilABelegt
  && (t10d.status === 401 || t10d.status === 403
    || (t10d.status === 200 && Array.isArray(t10d.data) && t10d.data.length === 0)),
  "HTTP " + t10d.status);

/* --- T11: Regressionswächter — Bestandspfade unversehrt ------------------ */
const t11a = await rest("GET", "/kd_store?scope=eq.demo&select=key&limit=1");
pruefe("T11a anon liest weiterhin kd_store scope=demo (Demo-Start intakt)", t11a.status === 200, "HTTP " + t11a.status);
const t11b = await rest("GET", "/kd_store?scope=eq.shared&select=key&limit=1");
pruefe("T11b Legacy-Shared ist öffentlich leer (aktive Beiträge liegen nicht mehr in kd_store)",
  t11b.status === 200 && Array.isArray(t11b.data) && t11b.data.length === 0,
  "HTTP " + t11b.status + " rows=" + (Array.isArray(t11b.data) ? t11b.data.length : "?"));
/* --- T11c-T11i: getrennter Katalogzugriff (Etappe 4, 25.07.2026) ---------
   ACHTUNG, zentral für alle Prüfungen hier unten: PostgREST antwortet bei
   RLS-Filterung mit HTTP 200 und LEEREM Array, nicht mit 403. Ein Statuscode
   beweist deshalb gar nichts über die Sichtbarkeit — geprüft wird der
   Zeileninhalt. (Die Vorgängerfassung von T11c prüfte status === 200 auf
   /kd_catalog und meldete „Programmkatalog intakt"; das blieb nach der
   Trennung falsch-grün, weil die manifest-Zeile den 200er allein trägt.) */
function namen(antwort) {
  return Array.isArray(antwort.data) ? antwort.data.map((z) => z?.name) : [];
}

const t11cat = await rest("GET", "/kd_catalog?select=name&order=name");
const anonNamen = namen(t11cat);
pruefe("T11c anon sieht die kd_catalog-Zeile manifest (Verbindungsnachweis)",
  t11cat.status === 200 && anonNamen.includes("manifest"),
  "HTTP " + t11cat.status + " sichtbar=[" + anonNamen.join(",") + "]");
pruefe("T11d anon sieht die kd_catalog-Zeile programm NICHT",
  t11cat.status === 200 && !anonNamen.includes("programm"),
  anonNamen.includes("programm") ? "LECK: Live-Programmdaten sind öffentlich lesbar!" : "HTTP " + t11cat.status);
pruefe("T11e anon sieht die kd_catalog-Zeile streaming NICHT",
  t11cat.status === 200
  && !anonNamen.includes("streaming")
  && !anonNamen.includes("streaming_bekannt")
  && !anonNamen.includes("streaming_entdecken"),
  anonNamen.some((name) => ["streaming", "streaming_bekannt", "streaming_entdecken"].includes(name))
    ? "LECK: Live-Streamingdaten sind öffentlich lesbar!" : "HTTP " + t11cat.status);

const t11f = await rest("GET", "/kd_catalog?select=name&order=name", { token: A.token });
const kontoNamen = namen(t11f);
pruefe("T11f angemeldete Sitzung sieht Programm sowie beide getrennten Streamingteile",
  t11f.status === 200
  && kontoNamen.includes("programm")
  && kontoNamen.includes("streaming_bekannt")
  && kontoNamen.includes("streaming_entdecken"),
  "HTTP " + t11f.status + " sichtbar=[" + kontoNamen.join(",") + "]"
  + " (fehlt eine Zeile ganz, ist nicht die Policy schuld, sondern die Pipeline)");
pruefe("T11f2 anon sieht beide getrennten Demo-Streamingteile",
  t11cat.status === 200
  && anonNamen.includes("streaming_bekannt_demo")
  && anonNamen.includes("streaming_entdecken_demo"),
  "HTTP " + t11cat.status + " sichtbar=[" + anonNamen.join(",") + "]");

const t11seed = await rest(
  "GET",
  "/kd_catalog?name=eq.demo_seed&select=name,payload,quelle,stand,gueltig_bis",
);
const demoSeedZeilen = Array.isArray(t11seed.data) ? t11seed.data : [];
const demoSeed = demoSeedZeilen[0];
pruefe("T11j anon sieht genau einen validierten demo_seed im Katalog",
  t11seed.status === 200
  && demoSeedZeilen.length === 1
  && demoSeed?.name === "demo_seed"
  && demoSeed?.payload?.format === 1
  && Array.isArray(demoSeed?.payload?.master?.filme)
  && demoSeed.payload.master.filme.length > 0,
  "HTTP " + t11seed.status + " rows=" + demoSeedZeilen.length);
pruefe("T11k demo_seed trägt Herkunft und Stand, aber bewusst kein künstliches Ablaufdatum",
  demoSeed?.quelle === "kinodreieck_demo" && !!demoSeed?.stand && demoSeed?.gueltig_bis === null,
  demoSeed ? "quelle=" + demoSeed.quelle + " stand=" + !!demoSeed.stand
    + " gueltig_bis=" + String(demoSeed.gueltig_bis) : "keine Zeile");

const t11seedKonto = await rest(
  "GET",
  "/kd_catalog?name=eq.demo_seed&select=name",
  { token: A.token },
);
pruefe("T11l angemeldete Sitzung sieht denselben öffentlichen demo_seed",
  t11seedKonto.status === 200
  && Array.isArray(t11seedKonto.data)
  && t11seedKonto.data.length === 1
  && t11seedKonto.data[0]?.name === "demo_seed",
  "HTTP " + t11seedKonto.status
  + " rows=" + (Array.isArray(t11seedKonto.data) ? t11seedKonto.data.length : "?"));

/* kd_quellen: anon hat GAR KEINE Rechte (revoke all) → PostgREST antwortet
   401 oder 403 mit Code 42501. Entscheidend bleibt: keine Zeilen. */
const t11g = await rest("GET", "/kd_quellen?select=slug&limit=1");
const t11gText = JSON.stringify(t11g.data || {});
const t11gZeilen = Array.isArray(t11g.data) ? t11g.data.length : 0;
const t11gRechteFehler = t11g.status === 401 || t11g.status === 403 || /42501/.test(t11gText);
pruefe("T11g anon bekommt auf kd_quellen KEINE Zeilen (erwartet: Rechte-Fehler 401/403 mit 42501)",
  t11gZeilen === 0 && (t11gRechteFehler || t11g.status === 200),
  "HTTP " + t11g.status + " rows=" + t11gZeilen
  + (t11gZeilen > 0 ? " — LECK: anon liest das Quellenregister!" : ""));
if (t11gZeilen === 0 && !t11gRechteFehler) {
  console.log("  Hinweis zu T11g: keine Zeilen, aber auch kein Rechte-Fehler (HTTP " + t11g.status
    + "). Erwartet war 401/403 mit 42501 — prüfen, ob das revoke aus Abschnitt A noch steht.");
}

const t11h = await rest("GET", "/kd_quellen?select=slug,status&limit=5", { token: A.token });
pruefe("T11h angemeldete Sitzung darf kd_quellen lesen",
  t11h.status === 200 && Array.isArray(t11h.data) && t11h.data.length > 0 && !!t11h.data[0]?.slug,
  "HTTP " + t11h.status + " rows=" + (Array.isArray(t11h.data) ? t11h.data.length : "?"));

/* Statusfunktion: EXECUTE ist anon und authenticated entzogen. Aufruf bewusst
   mit einem Slug, den es nicht gibt — selbst wenn das Recht fälschlich noch
   bestünde, bricht die Funktion vor jedem UPDATE/DELETE ab. Es wird also unter
   keinen Umständen etwas verändert. */
const t11i = await rest("POST", "/rpc/kd_quelle_status_setzen", {
  body: { p_slug: "__kd_rls_test_gibt_es_nicht__", p_status: "offen" },
});
const t11iText = JSON.stringify(t11i.data || {});
const funktionLief = /Unbekannte Quelle/.test(t11iText);
pruefe("T11i anon darf kd_quelle_status_setzen NICHT ausführen",
  !t11i.ok && !funktionLief
  && (t11i.status === 401 || t11i.status === 403 || t11i.status === 404 || /42501|PGRST202/.test(t11iText)),
  "HTTP " + t11i.status
  + (t11i.ok || funktionLief ? " — LECK: anon kann Quellen-Status setzen (und damit Katalogzeilen löschen)!" : ""));

/* --- T12: Sitzungstoken auf kd_store bleibt tabu -------------------------
   DOKTRINWECHSEL, bewusst getroffen in Etappe 4 am 25.07.2026 (Entscheidung
   E1=b, Migration 20260725220000): Der frühere Wächter „Tokens gehören nicht
   auf Katalogpfade" ist AUFGEHOBEN. Auf kd_catalog ist das Sitzungstoken ab
   sofort erwünscht — ohne Anmeldung gibt es programm/streaming nicht mehr
   (T11d/T11e/T11f). Unverändert gilt die Regel für kd_store: der alte
   schlüsselbasierte Sync ist ein rein öffentlicher Pfad, seine Policy hängt an
   anon; ein mitgeschicktes Sitzungstoken macht die Antwort dort leer. Wer hier
   ein Token anhängt, hat den Pfad verwechselt — das soll auffallen. */
const t12 = await rest("GET", "/kd_store?scope=eq.demo&select=key&limit=1", { token: A.token });
pruefe("T12 Sitzungstoken auf kd_store-Demo-Read liefert leer (Wächter: kd_store bleibt tokenfrei)",
  t12.status === 200 && Array.isArray(t12.data) && t12.data.length === 0,
  "HTTP " + t12.status + " rows=" + (Array.isArray(t12.data) ? t12.data.length : "?"));

/* --- T13: KI-Protokoll und -Konfiguration (Etappe 5) ----------------------
   Das Protokoll kd_ai_log ist zugleich der Budgetzähler. Ein Konto, das darin
   schreiben, löschen oder fremde Zeilen lesen könnte, könnte seinen eigenen
   Verbrauch umschreiben — die Kostengrenze wäre wertlos. kd_ai_limits trägt
   Not-Aus und Budgets und geht keinen Client etwas an.

   Besonderheit gegenüber kd_personal: Dort verhindert eine fehlende POLICY das
   Schreiben. Hier muss zusätzlich das GRANT weg sein — der adversariale Review
   fand, dass Supabase auf neue Tabellen per Standardrecht ALL an `authenticated`
   vergibt, und TRUNCATE unterliegt keiner RLS. T13e prüft deshalb das Recht
   selbst, nicht nur seine Wirkung. */
const t13a = await rest("GET", "/kd_ai_log?select=id&limit=1");
pruefe("T13a anon LESEN auf kd_ai_log wird abgewiesen",
  t13a.status === 401 || t13a.status === 403,
  "HTTP " + t13a.status + (t13a.status === 200 ? " — LECK: anon sieht das Nutzungsprotokoll!" : ""));

const t13b = await rest("GET", "/kd_ai_limits?select=schluessel&limit=1", { token: A.token });
pruefe("T13b angemeldetes Konto darf kd_ai_limits NICHT lesen",
  !t13b.ok || (Array.isArray(t13b.data) && t13b.data.length === 0),
  "HTTP " + t13b.status + " rows=" + (Array.isArray(t13b.data) ? t13b.data.length : "?")
  + (Array.isArray(t13b.data) && t13b.data.length ? " — LECK: Betriebskonfiguration ist einsehbar!" : ""));

const t13c = await rest("PATCH", "/kd_ai_limits?schluessel=eq.ai_aktiv", {
  token: A.token, body: { wert: false }, prefer: "return=representation",
});
const aiAusGeschaltet = t13c.ok && Array.isArray(t13c.data) && t13c.data.length > 0;
pruefe("T13c Konto kann den Not-Aus NICHT umlegen",
  !aiAusGeschaltet,
  "HTTP " + t13c.status + (aiAusGeschaltet ? " — LECK: ein Nutzer kann die KI fuer alle abschalten!" : ""));

/* Fremde Protokollzeilen: A darf B nicht sehen. RLS filtert ohne 403 — die
   Antwort ist 200 mit leerer Menge, deshalb wird der Inhalt geprüft, nie der
   Status (Lehre aus Etappe 4). */
const t13d = await rest("GET", `/kd_ai_log?account_id=eq.${B.id}&select=id,task&limit=5`, { token: A.token });
pruefe("T13d A sieht keine Protokollzeilen von B (200 mit leerer Menge)",
  t13d.status === 200 && Array.isArray(t13d.data) && t13d.data.length === 0,
  "HTTP " + t13d.status + " rows=" + (Array.isArray(t13d.data) ? t13d.data.length : "?")
  + (t13d.data?.length ? " — LECK: fremder Verbrauch ist sichtbar!" : ""));

/* Schreibversuch auf das eigene Protokoll: ein Konto darf seinen Verbrauch
   nicht erfinden (und damit auch nicht das Budget anderer verbrauchen). */
const t13e = await rest("POST", "/kd_ai_log", {
  token: A.token,
  body: { vorgang_id: "00000000-0000-4000-8000-00000000feed", task: "rls-probe", status: "fertig", kosten_usd_cent: 0 },
  prefer: "return=representation",
});
const konnteSchreiben = t13e.ok && Array.isArray(t13e.data) && t13e.data.length > 0;
pruefe("T13e Konto kann KEINE eigene Protokollzeile anlegen",
  !konnteSchreiben,
  "HTTP " + t13e.status + (konnteSchreiben ? " — LECK: Verbrauch ist frei erfindbar, das Budget waere wertlos!" : ""));

const t13f = await rest("DELETE", `/kd_ai_log?account_id=eq.${A.id}`, { token: A.token, prefer: "return=representation" });
const konnteLoeschen = t13f.ok && Array.isArray(t13f.data) && t13f.data.length > 0;
pruefe("T13f Konto kann eigene Protokollzeilen NICHT löschen",
  !konnteLoeschen,
  "HTTP " + t13f.status + (konnteLoeschen ? " — LECK: der eigene Verbrauch laesst sich wegraeumen!" : ""));

/* Die drei Betriebsfunktionen sind service_role vorbehalten. */
for (const [nr, fn, koerper] of [
  ["T13g", "kd_ai_auftrag_starten", { p_account: A.id, p_task: "rls-probe", p_vorgang: "00000000-0000-4000-8000-00000000beef" }],
  ["T13h", "kd_ai_log_abraeumen", { p_tage: 1 }],
  ["T13i", "kd_ai_verwaiste_schliessen", {}],
]) {
  const r = await rest("POST", "/rpc/" + fn, { token: A.token, body: koerper });
  const lief = r.ok && r.data !== null && r.data !== undefined;
  pruefe(`${nr} angemeldetes Konto darf ${fn} NICHT ausführen`,
    !lief && (r.status === 401 || r.status === 403 || r.status === 404 || /42501|PGRST202/.test(JSON.stringify(r.data || ""))),
    "HTTP " + r.status + (lief ? ` — LECK: ${fn} ist fuer Konten aufrufbar!` : ""));
}

/* --- T14: gemeinsamer Filmwissens-Cache (Etappe 8, Block 2) --------------
   Die Tabellen enthalten gemeinsames Wissen, sind aber trotzdem keine
   Browser-API: Rechtewiderruf und unveraenderliche Versionen duerfen nur ueber
   die engen RPC-Grenzen laufen. Authenticated darf genau die Lese-RPC nutzen. */
const filmwissenTabellen = [
  "kd_filmwissen_quellen",
  "kd_filmwerke",
  "kd_filmwerk_kennungen",
  "kd_filmwissen_auftraege",
  "kd_filmwissen_versionen",
  "kd_filmwissen_belege",
  "kd_filmwissen_zeigerlog",
];
for (const [index, tabelle] of filmwissenTabellen.entries()) {
  const [anonRead, kontoRead] = await Promise.all([
    rest("GET", `/${tabelle}?select=*&limit=1`),
    rest("GET", `/${tabelle}?select=*&limit=1`, { token: A.token }),
  ]);
  pruefe(`T14${String.fromCharCode(97 + index)} anon liest ${tabelle} NICHT`,
    anonRead.status === 401 || anonRead.status === 403,
    "HTTP " + anonRead.status + (anonRead.status === 200 ? " — LECK: rohe Cachetabelle ist oeffentlich!" : ""));
  pruefe(`T14${String.fromCharCode(104 + index)} Konto liest ${tabelle} NICHT direkt`,
    kontoRead.status === 401 || kontoRead.status === 403,
    "HTTP " + kontoRead.status + (kontoRead.status === 200 ? " — LECK: RPC-Grenze ist umgehbar!" : ""));
}

const filmwissenProbeId = "rls-probe-" + crypto.randomUUID();
const t14o = await rest("POST", "/rpc/kd_filmwissen_aktuell_lesen", {
  body: { p_namespace: "kinodreieck", p_kennung: filmwissenProbeId },
});
pruefe("T14o anon darf die Filmwissen-Lese-RPC NICHT ausführen",
  t14o.status === 401 || t14o.status === 403,
  "HTTP " + t14o.status + (t14o.ok ? " — LECK: Filmwissen ist trotz Auth-Vertrag anonym lesbar!" : ""));

const [t14p, t14q] = await Promise.all([
  rest("POST", "/rpc/kd_filmwissen_aktuell_lesen", {
    token: A.token, body: { p_namespace: "kinodreieck", p_kennung: filmwissenProbeId },
  }),
  rest("POST", "/rpc/kd_filmwissen_aktuell_lesen", {
    token: B.token, body: { p_namespace: "kinodreieck", p_kennung: filmwissenProbeId },
  }),
]);
pruefe("T14p angemeldetes Konto erhaelt ehrlich cache_miss",
  t14p.status === 200 && t14p.data?.status === "cache_miss",
  "HTTP " + t14p.status + " status=" + (t14p.data?.status || "?"));
pruefe("T14q gemeinsamer Leseweg antwortet beiden Konten gleich",
  t14q.status === 200 && JSON.stringify(t14q.data) === JSON.stringify(t14p.data),
  "A=" + JSON.stringify(t14p.data) + " B=" + JSON.stringify(t14q.data));

const t14r = await rest("POST", "/rpc/kd_filmwissen_quelle_speichern", {
  token: A.token, body: { p_quelle: null },
});
const t14rText = JSON.stringify(t14r.data || {});
pruefe("T14r Konto darf Quellenregister-RPC NICHT ausführen",
  !t14r.ok
  && !/quelle_ungueltig/.test(t14rText)
  && (t14r.status === 401 || t14r.status === 403 || t14r.status === 404 || /42501|PGRST202/.test(t14rText)),
  "HTTP " + t14r.status + (t14r.ok || /quelle_ungueltig/.test(t14rText)
    ? " — LECK: service_role-RPC wurde als Konto ausgeführt!" : ""));

/* --- T15: accountgebundene öffentliche Blog-Projektionen -----------------
   Tabellenzugriff bleibt privat; Öffentlichkeit sieht ausschließlich die
   schmale RPC ohne account_id. Schreiben und Löschen sind an auth.uid()
   gebunden. Die Probe wird im Cleanup nur anhand ihrer zufälligen Artikel-ID
   und öffentlichen ID wieder entfernt. */
const sharedArticleId = "rls-probe-" + crypto.randomUUID();
const sharedPayload = {
  id: sharedArticleId,
  titel: "RLS Shared Probe",
  autor: "RLS Test",
  text: "Temporäre, automatisch entfernte Testprojektion.",
  geordnet: false,
  erstellt_am: new Date().toISOString(),
  liste: [],
};

const t15a = await rest("GET", "/kd_shared_articles?select=publication_id&limit=1");
pruefe("T15a anon darf die Shared-Tabelle NICHT direkt lesen",
  t15a.status === 401 || t15a.status === 403,
  "HTTP " + t15a.status + (t15a.status === 200 ? " — LECK: account_id waere direkt abfragbar!" : ""));

const t15b = await rest("POST", "/kd_shared_articles", {
  token: A.token,
  body: { article_id: sharedArticleId, author: "RLS Test", payload: sharedPayload },
  prefer: "return=representation",
});
const sharedRow = Array.isArray(t15b.data) ? t15b.data[0] : null;
const sharedAngelegt = (t15b.status === 200 || t15b.status === 201)
  && sharedRow?.account_id === A.id
  && sharedRow?.article_id === sharedArticleId
  && !!sharedRow?.publication_id
  && !!sharedRow?.share_token;
pruefe("T15b A veröffentlicht OHNE account_id; der Server setzt auth.uid()",
  sharedAngelegt,
  "HTTP " + t15b.status + " account_id=" + (sharedRow?.account_id || "?"));

const t15c = await rest(
  "GET",
  `/kd_shared_articles?publication_id=eq.${encodeURIComponent(sharedRow?.publication_id || crypto.randomUUID())}&select=publication_id,account_id`,
  { token: B.token },
);
pruefe("T15c B sieht As Projektion in der Tabelle NICHT",
  sharedAngelegt && t15c.status === 200 && Array.isArray(t15c.data) && t15c.data.length === 0,
  "HTTP " + t15c.status + " rows=" + (Array.isArray(t15c.data) ? t15c.data.length : "?"));

const t15d = await rest("POST", "/rpc/kd_list_shared_articles", { body: {} });
const publicShared = Array.isArray(t15d.data)
  ? t15d.data.find((row) => row?.publication_id === sharedRow?.publication_id)
  : null;
pruefe("T15d anon liest die Projektion über die schmale öffentliche RPC",
  sharedAngelegt && t15d.status === 200 && publicShared?.payload?.id === sharedArticleId,
  "HTTP " + t15d.status);
pruefe("T15e die öffentliche RPC gibt keine Account-ID zurück",
  !!publicShared
  && publicShared.share_token === sharedRow?.share_token
  && !Object.prototype.hasOwnProperty.call(publicShared, "account_id"),
  publicShared ? "Felder=[" + Object.keys(publicShared).join(",") + "]" : "Probe fehlt");

const t15f = await rest("POST", "/rpc/kd_claim_shared_article", {
  body: { p_share_token: sharedRow?.share_token || crypto.randomUUID() },
});
pruefe("T15f anon darf keinen Blog-Token claimen",
  t15f.status === 401 || t15f.status === 403,
  "HTTP " + t15f.status);

const t15g = await rest("POST", "/rpc/kd_claim_shared_article", {
  token: A.token,
  body: { p_share_token: sharedRow?.share_token || crypto.randomUUID() },
});
pruefe("T15g Autor kann den eigenen Upload nicht erneut übernehmen",
  t15g.status === 200 && Array.isArray(t15g.data) && t15g.data[0]?.claimed === false,
  "HTTP " + t15g.status + " claimed=" + String(t15g.data?.[0]?.claimed) + " data=" + JSON.stringify(t15g.data));

const t15h = await rest("POST", "/rpc/kd_claim_shared_article", {
  token: B.token,
  body: { p_share_token: sharedRow?.share_token || crypto.randomUUID() },
});
const t15i = await rest("POST", "/rpc/kd_claim_shared_article", {
  token: B.token,
  body: { p_share_token: sharedRow?.share_token || crypto.randomUUID() },
});
pruefe("T15h–i B kann denselben Upload-Token exakt einmal übernehmen",
  t15h.status === 200 && t15h.data?.[0]?.claimed === true
  && t15i.status === 200 && t15i.data?.[0]?.claimed === false,
  "erst=" + String(t15h.data?.[0]?.claimed) + " zweit=" + String(t15i.data?.[0]?.claimed)
  + " data=" + JSON.stringify(t15h.data));

const t15j = await rest(
  "DELETE",
  `/kd_shared_articles?publication_id=eq.${encodeURIComponent(sharedRow?.publication_id || crypto.randomUUID())}`,
  { token: B.token, prefer: "return=representation" },
);
pruefe("T15j B kann As öffentliche Projektion NICHT löschen",
  sharedAngelegt && t15j.status === 200 && Array.isArray(t15j.data) && t15j.data.length === 0,
  "HTTP " + t15j.status + " rows=" + (Array.isArray(t15j.data) ? t15j.data.length : "?"));

/* --- Cleanup ------------------------------------------------------------- */
async function raeumeEigeneProbe(token, accountId, key, erlaubteWerte, angelegt) {
  if (!angelegt) return true;
  const stand = await rest(
    "GET",
    `/kd_personal?account_id=eq.${accountId}&key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
    { token },
  );
  if (stand.status !== 200 || !Array.isArray(stand.data) || stand.data.length !== 1) return false;
  const wert = stand.data[0]?.value;
  if (!erlaubteWerte.includes(wert)) return false;
  const geloescht = await rest(
    "DELETE",
    `/kd_personal?account_id=eq.${accountId}&key=eq.${encodeURIComponent(key)}&value=eq.${encodeURIComponent(wert)}`,
    { token, prefer: "return=representation" },
  );
  return geloescht.status === 200
    && Array.isArray(geloescht.data)
    && geloescht.data.length === 1
    && geloescht.data[0]?.value === wert;
}

const cA = await raeumeEigeneProbe(
  A.token, A.id, TESTKEY, [wertA, wertA + " ", wertA + " veraltet"], testAAngelegt,
);
const cB = await raeumeEigeneProbe(B.token, B.id, TESTKEY, [wertB], testBAngelegt);
const cProfil = profilAnlageVersucht
  ? await rest(
    "DELETE",
    `/kd_personal?account_id=eq.${A.id}&key=eq.${encodeURIComponent(PROFILKEY)}&value=eq.${encodeURIComponent(profilProbeWert)}`,
    { token: A.token, prefer: "return=representation" },
  )
  : { ok: true, status: 204, data: [] };
const profilCleanupOk = !profilAnlageVersucht
  || (cProfil.status === 200
    && Array.isArray(cProfil.data)
    && (profilVomTestAngelegt ? cProfil.data.length === 1 : cProfil.data.length === 0)
    && cProfil.data.every((zeile) => zeile?.value === profilProbeWert));
const cShared = sharedAngelegt
  ? await rest(
    "DELETE",
    `/kd_shared_articles?publication_id=eq.${encodeURIComponent(sharedRow.publication_id)}&article_id=eq.${encodeURIComponent(sharedArticleId)}`,
    { token: A.token, prefer: "return=representation" },
  )
  : { status: 204, data: [] };
const sharedCleanupOk = !sharedAngelegt
  || (cShared.status === 200
    && Array.isArray(cShared.data)
    && cShared.data.length === 1
    && cShared.data[0]?.publication_id === sharedRow.publication_id);
pruefe("Cleanup: temporäre Testzeilen entfernt; vorhandenes Profil bewahrt",
  cA && cB && profilCleanupOk && sharedCleanupOk);

console.log("");
if (fehler.length) {
  console.error(`${fehler.length} FEHLER, ${ok} Checks bestanden:`);
  for (const f of fehler) console.error("  - " + f);
  process.exit(1);
}
console.log(`${ok}/${ok} RLS-Negativtests bestanden. Account-Isolation belegt.`);
