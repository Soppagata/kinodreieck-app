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
        {identity:"library:dune-1984",sourceKind:"library",ref:"dune-1984",title:"Dune",year:1984,mediaType:"film",creator:"David Lynch"},
        {identity:"library:dune-2021",sourceKind:"library",ref:"dune-2021",title:"Dune",year:2021,mediaType:"film",creator:"Denis Villeneuve"},
      ]},
    { candidateId:"c-music",mention:"Water Music",titleSuggestion:"Water Music",kind:"music",year:1720,interpretation:"direct",
      evidence:{field:"text",quote:"1720 Water Music",start:30,end:46},mediaType:"musik",
      workOptions:[{identity:"library:water-1720",sourceKind:"library",ref:"water-1720",title:"Water Music",year:1720,mediaType:"musik",creator:"G. F. Handel"}]},
  ];
  function Harness(){
    const [referenceCount,setReferenceCount]=useState(0);
    globalThis.setBlogReferenceCount=setReferenceCount;
    const references=Array.from({length:referenceCount},(_,index)=>({rowId:"row-"+index,rank:index+1,title:"Vorhanden "+index,year:2000,mediaType:"film",state:"redlink",primaryTarget:null,secondaryTargets:[]}));
    const extraction={visible:true,capability:{status:"ready"},status:"result",binding:{requestId:"request-1"},suggestions,partial:false,errorCode:null,message:null,
      canStart:referenceCount<50,startReason:referenceCount>=50?"reference-limit":null,start:()=>{},cancel:()=>{},
      apply:async(candidates)=>{globalThis.appliedBlogCandidates=candidates;return {status:"applied",addedCount:candidates.length};}};
    const editor={draftKey:"draft-1",articleId:null,title:"Mein Blog",text:"Dune ist zweimal gemeint. 1720 Water Music.",ordered:false,references,anonymousPublication:false,dirty:true,saveStatus:"idle",displayState:"private"};
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
  assert.equal(await page.getByText("Konkrete Werke auswählen").isVisible(), true);
  assert.equal(await page.getByText(/David Lynch/).isVisible(), true);
  assert.equal(await page.getByText(/Denis Villeneuve/).isVisible(), true);
});
const duneWorks = page.locator(".kd-blog-suggestion").first().locator(".kd-blog-suggestion-work input");
await duneWorks.nth(0).check();
await duneWorks.nth(1).check();
await page.getByLabel(/Water Music.*Musik/).check();
await page.locator(".kd-blog-suggestion").nth(1).locator(".kd-blog-suggestion-work input").first().check();
await check("Mehrere gleichnamige Werke und Musik bleiben parallel auswählbar", async () => {
  assert.equal(await duneWorks.nth(0).isChecked(), true);
  assert.equal(await duneWorks.nth(1).isChecked(), true);
  assert.match(await page.locator(".kd-blog-suggestion").nth(1).innerText(), /1720.*G\. F\. Handel/s);
});

await page.evaluate(() => globalThis.setBlogReferenceCount(48));
await check("Bei zu wenig Restplatz bleibt die gesamte Mehrfachübernahme gesperrt", async () => {
  await page.getByText("Noch 2 von 50 Plätzen frei. Kein Vorschlag ist vorausgewählt.").waitFor();
  assert.equal(await page.getByRole("button", { name: "Ausgewählte übernehmen" }).isDisabled(), true);
  assert.match(await page.locator(".kd-blog-suggestion-apply").innerText(), /Noch 2 von 50 Plätzen frei/);
});
await page.evaluate(() => globalThis.setBlogReferenceCount(47));
await page.getByText("Noch 3 von 50 Plätzen frei. Kein Vorschlag ist vorausgewählt.").waitFor();
await page.getByRole("button", { name: "Ausgewählte übernehmen" }).click();
await check("Die UI übergibt alle drei bestätigten Werke in einem atomaren Aufruf", async () => {
  const applied = await page.evaluate(() => globalThis.appliedBlogCandidates);
  assert.equal(applied.length, 3);
  assert.deepEqual(applied.map((candidate) => candidate.ref), ["dune-1984", "dune-2021", "water-1720"]);
  assert.equal(applied[2].mediaType, "musik");
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
