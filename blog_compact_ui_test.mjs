import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const rootDir = process.cwd();
const moduleRoot = process.env.KD_TEST_NODE_MODULES || path.join(rootDir, "node_modules");
const requireFromTestEnv = createRequire(path.join(moduleRoot, "__kd_test_resolver__.cjs"));
const { build } = requireFromTestEnv("esbuild");
const { chromium } = requireFromTestEnv("@playwright/test");
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), "kd-blog-ui-"));
const fixture = JSON.parse(fs.readFileSync(path.join(rootDir, "tests/fixtures/blog-contract-v1.json"), "utf8"));
let checks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log(`✓ ${name}`); };

const entry = `
  import React, { useState } from "react";
  import { createRoot } from "react-dom/client";
  import { BlogTab } from "./src/tabs/BlogTab.jsx";
  const refs = [
    { rowId:"row-01", rank:1, title:"Star Wars: A New Hope", year:1977, mediaType:"film", state:"available", primaryTarget:{kind:"library",ref:"local-1",titel:"Star Wars"}, secondaryTargets:[] },
    { rowId:"row-02", rank:2, title:"Star Wars: The Empire Strikes Back – eine absichtlich sehr lange Titelprobe für schmale Bildschirme", year:1980, mediaType:"film", state:"available", primaryTarget:{kind:"streaming",sourceId:"disney",ref:"stream-2",titel:"Empire"}, secondaryTargets:[] },
    { rowId:"row-03", rank:3, title:"Star Wars: Return of the Jedi", year:1983, mediaType:"film", state:"available", primaryTarget:{kind:"cinema",ref:"kino-3",titel:"Jedi"}, secondaryTargets:[] },
    { rowId:"row-04", rank:4, title:"Star Wars: Synthetic Missing Story", year:1984, mediaType:"film", state:"redlink", primaryTarget:null, secondaryTargets:[] },
    { rowId:"row-05", rank:5, title:"Rogue One", year:2016, mediaType:"film", state:"unchecked", primaryTarget:null, secondaryTargets:[] },
  ];
  const fixtureOutcomes = ${JSON.stringify({ failed: JSON.parse(fs.readFileSync(path.join(rootDir, "tests/fixtures/blog-contract-v1.json"), "utf8")).saveOutcomes.publishPartialFailure, unknown: JSON.parse(fs.readFileSync(path.join(rootDir, "tests/fixtures/blog-contract-v1.json"), "utf8")).saveOutcomes.publishUnknown })};
  function Harness(){
    const [view,setView]=useState({area:"mine",mode:"list",articleId:null,returnToken:null});
    const [editor,setEditor]=useState({draftKey:"draft-1",articleId:null,contentVersion:null,title:"",text:"",ordered:true,references:refs,anonymousPublication:false,dirty:false,saveStatus:"idle"});
    const [reader,setReader]=useState(null); const [redlinkForm,setRedlink]=useState(null); const [saveOutcome,setSaveOutcome]=useState("failed");
    globalThis.blogSetSaveOutcome=setSaveOutcome;
    const card={articleId:"article-1",title:"Meine sehr lange Star-Wars-Rangliste für einen schmalen Bildschirm",excerpt:"Eine vollständige Probe mit mehreren Referenzen und einem langen Auszug, der auf der Karte knapp bleibt.",updatedAt:"2032-05-04T11:00:00Z",displayState:"private_changes",ordered:true,referencePreview:refs};
    const actions={
      onNewArticle:()=>{setEditor(e=>({...e,articleId:null,title:"",text:"",anonymousPublication:false}));setView({area:"mine",mode:"editor",articleId:null,returnToken:"mine"});},
      onEditArticle:({articleId})=>{setEditor(e=>({...e,articleId,title:card.title,text:card.excerpt}));setView({area:"mine",mode:"editor",articleId,returnToken:"mine"});},
      onReadArticle:({scope,articleId,returnToken})=>{setReader({scope,article:{articleId,title:card.title,text:card.excerpt+"\\n\\nVoller gemeinsamer Lesertext.",ordered:true},referenceViews:refs,canEdit:scope==="private",returnToken:returnToken||"mine"});setView({area:scope==="published"?"published":"mine",mode:"reader",articleId,returnToken:returnToken||"mine"});},
      onBack:()=>setView({area:"mine",mode:"list",articleId:null,returnToken:null}),
      onEditorChange:(patch)=>setEditor(e=>({...e,...patch,dirty:true})),
      onAddReference:()=>{},
      onMoveReference:({rowId,direction})=>setEditor(e=>{const a=[...e.references].sort((x,y)=>x.rank-y.rank);const i=a.findIndex(x=>x.rowId===rowId);const j=direction==="up"?i-1:i+1;if(j<0||j>=a.length)return e;[a[i],a[j]]=[a[j],a[i]];return {...e,references:a.map((x,k)=>({...x,rank:k+1}))};}),
      onRemoveReference:({rowId})=>setEditor(e=>({...e,references:e.references.filter(x=>x.rowId!==rowId).map((x,k)=>({...x,rank:k+1}))})),
      onSave:async()=>editor.anonymousPublication ? fixtureOutcomes[saveOutcome] : {private:{status:"saved"},publication:{status:"not_requested",operationId:null}},
      onReferenceDecision:async()=>({status:"saved"}), onNavigateReference:()=>{},
      onOpenRedlinkForm:({articleId,rowId})=>{setRedlink({articleId:articleId||"article-1",rowId,status:"open",initial:{titel:"Star Wars: Synthetic Missing Story",jahr:1984,typ:"film"},errorCode:null});setView({area:"mine",mode:"redlink_form",articleId:articleId||"article-1",returnToken:"editor"});},
      onCancelRedlinkForm:()=>setView({area:"mine",mode:"editor",articleId:editor.articleId,returnToken:"mine"}),
      onConfirmRedlinkForm:async()=>{setEditor(e=>({...e,references:e.references.map(x=>x.rowId==="row-04"?{...x,state:"available",primaryTarget:{kind:"library",ref:"local-4",titel:x.title}}:x)}));setView({area:"mine",mode:"editor",articleId:editor.articleId,returnToken:"mine"});return {status:"saved",mediaWriteConfirmed:true};},
      onRetryPublication:async()=>null,onWithdraw:async()=>({status:"withdrawn"}),onDelete:async()=>({private:{status:"deleted"}}),onLoadPublished:async()=>({status:"loaded"}),
    };
    return <BlogTab publicationCapability={{status:"ready",reason:null}} view={view} editor={editor} reader={reader} redlinkForm={redlinkForm} articleCards={[card]}
      publishedPage={{status:"ready",items:[card],nextCursor:null,complete:true,errorCode:null}} actions={actions}/>;
  }
  globalThis.mountBlogFixture=(node)=>createRoot(node).render(<Harness/>);
`;
const result = await build({ stdin: { contents: entry, sourcefile: "blog-browser-entry.jsx", resolveDir: rootDir, loader: "jsx" }, bundle: true, outdir, platform: "browser", format: "iife", jsx: "automatic", nodePaths: [moduleRoot], define: { "import.meta.env": "{}" } });
assert.ok(result);
const js = fs.readFileSync(path.join(outdir, "stdin.js"), "utf8");
const css = fs.readFileSync(path.join(outdir, "stdin.css"), "utf8");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent(`<main id="root"></main><style>html{background:#17151A}body{margin:0;padding:12px;background:#17151A;color:#ECE8DF}</style>`);
await page.addStyleTag({ content: css }); await page.addScriptTag({ content: js });
await page.evaluate(() => globalThis.mountBlogFixture(document.getElementById("root")));

await page.getByRole("button", { name: "+ Neuer Artikel" }).click();
await check("Neu startet mit ausgeschalteter Anonym-Checkbox", async () => assert.equal(await page.getByLabel("Anonym veröffentlichen").isChecked(), false));
await page.getByLabel("Titel", { exact: true }).fill("Ein Titel"); await page.getByLabel("Text", { exact: true }).fill("Ein Text");
await page.getByLabel("Anonym veröffentlichen").check();
await check("Der Publish-Intent hat die eindeutige Abschlussbeschriftung", async () => assert.equal(await page.getByRole("button", { name: "Speichern & veröffentlichen" }).isVisible(), true));
await page.getByRole("button", { name: "Speichern & veröffentlichen" }).click();
await page.getByText("Privat gespeichert, Veröffentlichung fehlgeschlagen.").waitFor();
await page.evaluate(() => globalThis.blogSetSaveOutcome("unknown"));
await page.getByRole("button", { name: "Speichern & veröffentlichen" }).click();
await page.getByText("Privat gespeichert. Ob die Veröffentlichung angekommen ist, wird geprüft.").waitFor();
await check("Teilerfolg und unbekannter Ausgang stammen aus der Vertragsfixture", () => {
  assert.equal(fixture.saveOutcomes.publishPartialFailure.private.status, "saved");
  assert.equal(fixture.saveOutcomes.publishUnknown.publication.status, "unknown");
});

const before = await page.locator(".kd-blog-reference-title").allTextContents();
await page.getByLabel("Aktionen für Star Wars: The Empire Strikes Back – eine absichtlich sehr lange Titelprobe für schmale Bildschirme").click();
await page.getByRole("button", { name: "Nach oben" }).click();
const after = await page.locator(".kd-blog-reference-title").allTextContents();
await check("Umordnen adressiert die stabile Zeile", () => assert.notDeepEqual(after, before));

await page.getByRole("button", { name: /Star Wars: Synthetic Missing Story.*Rotlink/ }).click();
await page.getByRole("heading", { name: "Rotlink ergänzen" }).waitFor();
await page.getByRole("button", { name: "← Zurück" }).click();
await check("Rotlink-Abbruch kehrt mit erhaltenem Entwurf zurück", async () => assert.equal(await page.getByLabel("Titel", { exact: true }).inputValue(), "Ein Titel"));
await page.getByRole("button", { name: /Star Wars: Synthetic Missing Story.*Rotlink/ }).click();
await page.getByText("Ohne Bewertung speichern").click(); await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
await page.getByRole("heading", { name: "Neuer Artikel" }).waitFor();
await check("Bestätigte Rotlink-Ergänzung kehrt in denselben Editor zurück", async () => assert.match(await page.locator(".kd-blog-reference-list").innerText(), /Mediathek/));

for (const width of [320, 393, 736]) {
  await page.setViewportSize({ width, height: width === 320 ? 480 : 760 });
  for (const scheme of ["dark", "light"]) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate((value) => { document.body.style.colorScheme = value; document.body.style.background = value === "light" ? "#edeae3" : "#17151A"; }, scheme);
    const metrics = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
      controls: [...document.querySelectorAll("button, summary")].filter((el) => el.offsetParent).map((el) => el.getBoundingClientRect().height) }));
    await check(`${width}px ${scheme}: keine horizontale Überlappung`, () => assert.ok(metrics.scroll <= metrics.client));
    await check(`${width}px ${scheme}: sichtbare Touchziele mindestens 44px`, () => assert.ok(metrics.controls.every((height) => height >= 43.5)));
  }
}

await page.getByRole("button", { name: "← Zurück" }).click();
await check("Karten zeigen höchstens drei schlichte Referenzzeilen", async () => assert.equal(await page.locator(".kd-blog-card .kd-blog-reference-row").count(), 3));
await page.getByRole("button", { name: "Lesen", exact: true }).click();
await check("Lesen zeigt den vollen Text und alle fünf Referenzen ohne Klappe", async () => {
  assert.match(await page.locator(".kd-blog-reader-text").innerText(), /Voller gemeinsamer Lesertext/);
  assert.equal(await page.locator(".kd-blog-reader .kd-blog-reference-row").count(), 5);
});
await page.getByRole("button", { name: "← Zurück" }).click(); await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
await check("Neu, Lesen, Zurück und Bearbeiten bleiben direkte Wege", async () => assert.equal(await page.getByRole("heading", { name: "Artikel bearbeiten" }).isVisible(), true));

await browser.close(); fs.rmSync(outdir, { recursive: true, force: true });
console.log(`blog_compact_ui_test: ${checks} Checks bestanden (echter Chromium, nur Fixtures).`);
