#!/usr/bin/env node
/* RLS-Negativtest für kd_personal — läuft gegen die ECHTE Datenbank.
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
const t11c = await rest("GET", "/kd_catalog?select=name&limit=1");
pruefe("T11c anon liest weiterhin kd_catalog (Programmkatalog intakt)", t11c.status === 200, "HTTP " + t11c.status);

/* --- T12: User-Token gehört nicht auf Katalogpfade ----------------------- */
const t12 = await rest("GET", "/kd_store?scope=eq.demo&select=key&limit=1", { token: A.token });
pruefe("T12 User-JWT auf Demo-Read liefert leer statt Daten (Wächter: Tokens gehören nicht auf Katalogpfade)",
  t12.status === 200 && Array.isArray(t12.data) && t12.data.length === 0,
  "HTTP " + t12.status + " rows=" + (Array.isArray(t12.data) ? t12.data.length : "?"));

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
