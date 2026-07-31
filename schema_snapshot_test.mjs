/* Geheimnisfreier Current-Schema-Vertrag. Der Snapshot ist kein Datendump. */

import fs from "node:fs";

const sql = fs.readFileSync("supabase/current_schema.sql", "utf8");
let ok = 0;
function check(name, wert) {
  if (!wert) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

const treffer = (muster) => (sql.match(muster) || []).length;
check("Snapshot erklärt Herkunft und Datenfreiheit",
  /Current-Schema-Snapshot/.test(sql)
  && /Keine Tabellenzeilen, Konten oder Secrets/.test(sql));
check("Snapshot enthält keine Tabelleninhalte",
  !/^(?:COPY|INSERT INTO|\\connect)\b/m.test(sql));
check("Snapshot enthält keine erkennbaren Zugangsdaten",
  !/sb_secret_|sk-ant-|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|PASSWORD\s*=/i.test(sql)
  && !/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(sql));
check("Produktionsstand enthält alle 18 Anwendungstabellen",
  treffer(/^CREATE TABLE IF NOT EXISTS "public"\./gm) === 18);
check("Produktionsstand enthält Funktionen, Trigger und Policies",
  treffer(/^CREATE OR REPLACE FUNCTION "public"\./gm) === 42
  && treffer(/^CREATE OR REPLACE TRIGGER /gm) === 13
  && treffer(/^CREATE POLICY /gm) === 21);
for (const tabelle of [
  "kd_catalog",
  "kd_personal",
  "kd_shared_articles",
  "kd_ai_log",
  "kd_filmwerke",
  "kd_store",
]) {
  check(`Snapshot enthält ${tabelle}`,
    sql.includes(`CREATE TABLE IF NOT EXISTS "public"."${tabelle}"`));
}
check("Legacy-kd_store ist vollständig statt nur als Tabellenname dokumentiert",
  /FUNCTION "public"\."kd_key_ok"/.test(sql)
  && /TRIGGER "kd_touch_trg"/.test(sql)
  && /POLICY "sel_demo" ON "public"\."kd_store"/.test(sql)
  && /POLICY "sel_user" ON "public"\."kd_store"/.test(sql));
check("Accountdaten bleiben über auth.uid kontogebunden",
  /POLICY "kdp_sel"[\s\S]+?"account_id" = \( SELECT "auth"\."uid"\(\)/.test(sql)
  && /POLICY "kdsa_owner_select"[\s\S]+?"account_id" = \( SELECT "auth"\."uid"\(\)/.test(sql));
check("Öffentlicher Katalogvertrag enthält den gemeinsamen Demo-Seed",
  /POLICY "kd_catalog_read_public"[\s\S]+?'demo_seed'::"text"/.test(sql));
check("Streaming-Katalog ist getrennt und bleibt für alte Publisher kompatibel",
  /'streaming_bekannt'::"text"/.test(sql)
  && /'streaming_entdecken'::"text"/.test(sql)
  && /FUNCTION "public"\."kd_catalog_streaming_aufteilen"/.test(sql)
  && /TRIGGER "kd_catalog_streaming_split"/.test(sql));
check("Nur die beiden getrennten Demo-Teile sind zusätzlich öffentlich",
  /POLICY "kd_catalog_read_public"[\s\S]+?'streaming_bekannt_demo'::"text"[\s\S]+?'streaming_entdecken_demo'::"text"/.test(sql)
  && /POLICY "kd_catalog_read_konto"[\s\S]+?USING \(true\)/.test(sql));

console.log(`schema_snapshot_test: ${ok} Checks bestanden.`);
