import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const rootDir = process.cwd();
const moduleRoot = process.env.KD_TEST_NODE_MODULES || path.join(rootDir, "node_modules");
const requireFromTestEnv = createRequire(path.join(moduleRoot, "__kd_blog_reference_extract_ui__.cjs"));
const { build } = requireFromTestEnv("esbuild");
const { chromium } = requireFromTestEnv("@playwright/test");
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), "kd-blog-reference-extract-ui-"));
let checks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log(`✓ ${name}`); };

const entry = `
  import React, { useState } from "react";
  import { createRoot } from "react-dom/client";
  import "./src/styles/design-foundation.css";
  import { BlogTab } from "./src/tabs/BlogTab.jsx";
  const suggestions = [
    { candidateId:"c-dune",mention:"Dune",titleSuggestion:"Dune",kind:"title_group",year:null,interpretation:"ambiguous",
      evidence:{field:"text",quote:"Dune ist zweimal gemeint",start:0,end:23},mediaType:null,
      workOptions:[
        {identity:"work:dune-1984",title:"Dune",year:1984,mediaType:"film",creator:"David Lynch",sourceLabels:["Mediathek"],identityHints:[{namespace:"imdb",value:"tt0087182"}],sourceObservations:[]},
        {identity:"work:dune-2021",title:"Dune",year:2021,mediaType:"film",creator:"Denis Villeneuve",sourceLabels:["Mediathek","Streaming-Katalog","Kinoprogramm"],identityHints:[{namespace:"imdb",value:"tt1160419"}],sourceObservations:[]},
      ],requiresWorkDecision:true},
    { candidateId:"c-2001",mention:"2001",titleSuggestion:"2001: A Space Odyssey",kind:"film",year:1968,interpretation:"interpreted",
      evidence:{field:"text",quote:"2001",start:30,end:34},mediaType:"film",requiresWorkDecision:false,
      workOptions:[{identity:"work:2001",title:"2001: A Space Odyssey",year:1968,mediaType:"film",creator:"Stanley Kubrick",sourceLabels:["Mediathek","Streaming-Katalog","Kinoprogramm"],identityHints:[{namespace:"imdb",value:"tt0062622"}],sourceObservations:[]}]},
    { candidateId:"c-burn",mention:"Evil Dead Burn",titleSuggestion:"Evil Dead Burn",kind:"film",year:2026,interpretation:"direct",
      evidence:{field:"text",quote:"Evil Dead Burn",start:50,end:64},mediaType:"film",workOptions:[],requiresWorkDecision:false},
  ];
  function Harness(){
    const [referenceCount,setReferenceCount]=useState(0);
    globalThis.setBlogReferenceCount=setReferenceCount;
    const references=Array.from({length:referenceCount},(_,index)=>({rowId:"row-"+index,rank:index+1,title:"Vorhanden "+index,year:2000,mediaType:"film",state:"redlink",primaryTarget:null,secondaryTargets:[]}));
    const extraction={visible:true,capability:{status:"ready"},status:"result",binding:{requestId:"request-1"},suggestions,partial:false,errorCode:null,message:null,
      sources:{streaming:{status:"ready"},cinema:{status:"ready"}},
      canStart:referenceCount<50,startReason:referenceCount>=50?"reference-limit":null,start:()=>{},cancel:()=>{},
      apply:async(candidates)=>{globalThis.appliedBlogCandidates=candidates;return {status:"applied",addedCount:candidates.length};}};
    const editor={draftKey:"draft-1",articleId:null,title:"Mein Blog",text:"Dune ist zweimal gemeint. 2001. Evil Dead Burn.",ordered:false,references,anonymousPublication:false,dirty:true,saveStatus:"idle",displayState:"private"};
    const actions={onEditorChange:()=>{},onAddReference:()=>{},onMoveReference:()=>{},onRemoveReference:()=>{},onSave:async()=>({private:{status:"saved"},publication:{status:"not_requested"}})};
    return <BlogTab publicationCapability={{status:"ready"}} view={{area:"mine",mode:"editor",articleId:null,returnToken:"mine:list"}}
      editor={editor} referenceExtraction={extraction} actions={actions}/>;
  }
  globalThis.mountBlogReferenceFixture=(node)=>createRoot(node).render(<Harness/>);
`;
await build({ stdin: { contents: entry, sourcefile: "blog-reference-ui-entry.jsx", resolveDir: rootDir, loader: "jsx" },
  bundle: true, outdir, platform: "browser", format: "iife", jsx: "automatic", nodePaths: [moduleRoot], define: { "import.meta.env": "{}" } });
const js = fs.readFileSync(path.join(outdir, "stdin.js"), "utf8");
const css = fs.readFileSync(path.join(outdir, "stdin.css"), "utf8");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 393, height: 900 } });
await page.setContent("<main id='root'></main><style>html{background:#17151A}body{margin:0;padding:12px;background:#17151A;color:#ECE8DF}</style>");
await page.addStyleTag({ content: css });
await page.addScriptTag({ content: js });
await page.evaluate(() => globalThis.mountBlogReferenceFixture(document.getElementById("root")));

await check("Die Nebenaktion erklärt sofort den Anthropic-Transfer einschließlich persönlicher Angaben", async () => {
  assert.equal(await page.getByRole("button", { name: "Titel im Text erkennen (KI)" }).isVisible(), true);
  assert.match(await page.locator(".kd-blog-ai-reference-head").innerText(), /Persönliche Angaben im Text werden mitgesendet/);
});
await check("Erwähnungen und konkrete Werke starten vollständig ohne Vorauswahl", async () => {
  assert.equal(await page.locator(".kd-blog-suggestions input[type=checkbox]:checked").count(), 0);
  assert.equal(await page.getByRole("button", { name: "Ausgewählte übernehmen" }).isDisabled(), true);
});
await page.getByLabel(/Dune.*Titelgruppe/).check();
await check("Die Erwähnungsauswahl öffnet eine getrennte konkrete Werkauswahl", async () => {
  assert.equal(await page.getByText("Welches Werk ist gemeint?").first().isVisible(), true);
  assert.equal(await page.getByText(/David Lynch/).isVisible(), true);
  assert.equal(await page.getByText(/Denis Villeneuve/).isVisible(), true);
  assert.match(await page.locator(".kd-blog-suggestion").first().innerText(), /Streaming-Katalog.*Kinoprogramm/s);
});
await page.getByRole("button", { name: "Ausgewählte übernehmen" }).click();
await check("Eine echte Werkmehrdeutigkeit nennt den offenen Titel direkt am Übernahmebutton", async () => {
  assert.match(await page.locator(".kd-blog-suggestion-apply").innerText(), /Entscheidung offen bei „Dune“/);
  assert.equal(await page.evaluate(() => globalThis.appliedBlogCandidates), undefined);
  assert.equal(await page.locator(".kd-blog-suggestion").first().evaluate((node) => document.activeElement === node), true);
});
const duneWorks = page.locator(".kd-blog-suggestion").first().locator(".kd-blog-suggestion-work input");
await duneWorks.nth(1).check();
await page.getByLabel(/2001: A Space Odyssey.*Film/).check();
await page.getByLabel(/Evil Dead Burn.*Film/).check();
await check("Klare Werke mit mehreren oder ohne Fundort brauchen keinen Unterhaken", async () => {
  assert.equal(await duneWorks.nth(1).isChecked(), true);
  assert.match(await page.locator(".kd-blog-suggestion").nth(1).innerText(), /Als ein Werk übernehmen.*Mediathek.*Streaming-Katalog.*Kinoprogramm/s);
  assert.equal(await page.locator(".kd-blog-suggestion").nth(1).locator(".kd-blog-suggestion-work input").count(), 0);
  assert.match(await page.locator(".kd-blog-suggestion").nth(2).innerText(), /aktuell in keinem Bestand gefunden/);
  assert.equal(await page.locator(".kd-blog-suggestion").nth(2).locator(".kd-blog-suggestion-work input").count(), 0);
});

await page.getByText("3 Erwähnungen markiert · 3 Referenzen bereit.").waitFor();

await page.evaluate(() => globalThis.setBlogReferenceCount(48));
await check("Bei zu wenig Restplatz bleibt die gesamte Mehrfachübernahme gesperrt", async () => {
  await page.getByText("Für die gesamte Auswahl ist nicht genug Platz. Es wurde nichts übernommen.").waitFor();
  assert.equal(await page.getByRole("button", { name: "Ausgewählte übernehmen" }).isDisabled(), true);
  assert.doesNotMatch(await page.locator(".kd-blog-ai-references").innerText(), /Noch \d+ von 50 Plätzen frei/);
});
await page.evaluate(() => globalThis.setBlogReferenceCount(47));
await page.getByText("Für die gesamte Auswahl ist nicht genug Platz. Es wurde nichts übernommen.").waitFor({ state: "detached" });
await page.getByRole("button", { name: "Ausgewählte übernehmen" }).click();
await check("Die UI übergibt drei bestätigte Werke in einem atomaren Aufruf", async () => {
  const applied = await page.evaluate(() => globalThis.appliedBlogCandidates);
  assert.equal(applied.length, 3);
  assert.deepEqual(applied.map((candidate) => candidate.ref), [null, null, null]);
  assert.deepEqual(applied.map((candidate) => candidate.year), [2021, 1968, 2026]);
  assert.equal(applied.every((candidate) => candidate.resolutionIntent.kind === "auto"), true);
  assert.equal(await page.locator(".kd-blog-suggestions input[type=checkbox]:checked").count(), 0);
});

for (const width of [320, 393]) {
  await page.setViewportSize({ width, height: 900 });
  const metrics = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    controls: [...document.querySelectorAll("button")].filter((element) => element.offsetParent)
      .map((element) => element.getBoundingClientRect().height),
  }));
  await check(`${width}px: Auswahl bleibt ohne horizontales Überlaufen`, () => assert.ok(metrics.scroll <= metrics.client));
  await check(`${width}px: sichtbare Aktionen bleiben mindestens 44px hoch`, () => assert.ok(metrics.controls.every((height) => height >= 43.5)));
}

await page.evaluate(() => globalThis.setBlogReferenceCount(50));
await check("Bei 50 Referenzen ist der potenziell kostenpflichtige Start sichtbar erklärt und gesperrt", async () => {
  await page.getByText("Bei 50 Referenzen ist kein KI-Start möglich.").waitFor();
  assert.equal(await page.getByRole("button", { name: "Titel im Text erkennen (KI)" }).isDisabled(), true);
  assert.match(await page.locator(".kd-blog-ai-references").innerText(), /Bei 50 Referenzen ist kein KI-Start möglich/);
});

await browser.close();
fs.rmSync(outdir, { recursive: true, force: true });
console.log(`blog_reference_extract_ui_test: ${checks} Checks bestanden (echter Chromium, nur Fixtures).`);
