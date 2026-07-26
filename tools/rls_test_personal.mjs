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

const TESTKEY = "kd:vokabular";     // erlaubter Topf, den die App selten nutzt
const FREMDKEY = "kd:boeser-topf";  // steht NICHT in der Key-Allowlist

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

/* --- T1/T2: anon darf gar nichts --------------------------------------- */
const t1 = await rest("GET", "/kd_personal?select=key&limit=1");
pruefe("T1 anon LESEN wird abgewiesen (kein 200)", t1.status === 401 || t1.status === 403,
  "HTTP " + t1.status + (t1.status === 200 ? " — LECK: anon sieht Zeilen!" : ""));

const t2 = await rest("POST", "/kd_personal", { body: { key: TESTKEY, value: "x" } });
pruefe("T2 anon SCHREIBEN wird abgewiesen", t2.status === 401 || t2.status === 403, "HTTP " + t2.status);

/* --- T3/T7: A schreibt und liest eigene Zeilen -------------------------- */
const wertA = JSON.stringify([{ wort: "rls-test-a", t: Date.now() }]);
const t7 = await rest("POST", "/kd_personal", {
  token: A.token, body: { key: TESTKEY, value: wertA }, prefer: "return=representation",
});
const zeileA = Array.isArray(t7.data) ? t7.data[0] : null;
pruefe("T7 A legt eigene Zeile OHNE account_id an (Server setzt sie)",
  (t7.status === 201 || t7.status === 200) && zeileA?.account_id === A.id && zeileA?.revision === 1,
  "HTTP " + t7.status + " account_id=" + (zeileA?.account_id || "?"));

const t3 = await rest("GET", `/kd_personal?key=eq.${encodeURIComponent(TESTKEY)}&select=key,value,revision`, { token: A.token });
pruefe("T3 A liest die eigene Zeile", t3.ok && Array.isArray(t3.data) && t3.data[0]?.value === wertA);

/* --- T4: A sieht nichts von B ------------------------------------------ */
const wertB = JSON.stringify([{ wort: "rls-test-b", t: Date.now() }]);
await rest("POST", "/kd_personal", { token: B.token, body: { key: TESTKEY, value: wertB }, prefer: "return=representation" });
const t4 = await rest("GET", `/kd_personal?account_id=eq.${B.id}&select=key,value`, { token: A.token });
pruefe("T4 A liest B: 200 mit LEERER Menge (RLS filtert, kein Leck)",
  t4.status === 200 && Array.isArray(t4.data) && t4.data.length === 0,
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
  token: A.token, body: { value: "veraltet" }, prefer: "return=representation",
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

/* --- T11: Regressionswächter — Bestandspfade unversehrt ------------------ */
const t11a = await rest("GET", "/kd_store?scope=eq.demo&select=key&limit=1");
pruefe("T11a anon liest weiterhin kd_store scope=demo (Demo-Start intakt)", t11a.status === 200, "HTTP " + t11a.status);
const t11b = await rest("GET", "/kd_store?scope=eq.shared&select=key&limit=1");
pruefe("T11b anon liest weiterhin kd_store scope=shared (geteilte Blogs intakt)", t11b.status === 200, "HTTP " + t11b.status);
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
  t11cat.status === 200 && !anonNamen.includes("streaming"),
  anonNamen.includes("streaming") ? "LECK: Streaming-Daten sind öffentlich lesbar!" : "HTTP " + t11cat.status);

const t11f = await rest("GET", "/kd_catalog?select=name&order=name", { token: A.token });
const kontoNamen = namen(t11f);
pruefe("T11f angemeldete Sitzung sieht programm UND streaming",
  t11f.status === 200 && kontoNamen.includes("programm") && kontoNamen.includes("streaming"),
  "HTTP " + t11f.status + " sichtbar=[" + kontoNamen.join(",") + "]"
  + " (fehlt eine Zeile ganz, ist nicht die Policy schuld, sondern die Pipeline)");

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

/* --- Cleanup ------------------------------------------------------------- */
const cA = await rest("DELETE", `/kd_personal?key=eq.${encodeURIComponent(TESTKEY)}`, { token: A.token });
const cB = await rest("DELETE", `/kd_personal?key=eq.${encodeURIComponent(TESTKEY)}`, { token: B.token });
pruefe("Cleanup: beide Testzeilen entfernt", (cA.ok || cA.status === 204) && (cB.ok || cB.status === 204));

console.log("");
if (fehler.length) {
  console.error(`${fehler.length} FEHLER, ${ok} Checks bestanden:`);
  for (const f of fehler) console.error("  - " + f);
  process.exit(1);
}
console.log(`${ok}/${ok} RLS-Negativtests bestanden. Account-Isolation belegt.`);
