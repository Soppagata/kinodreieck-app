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
  import "./src/styles/design-foundation.css";
  import { BlogTab } from "./src/tabs/BlogTab.jsx";
  const refs = [
    { rowId:"row-01", rank:1, title:"Star Wars: A New Hope", year:1977, mediaType:"film", state:"available", primaryTarget:{kind:"library",ref:"local-1",titel:"Star Wars"}, secondaryTargets:[{kind:"streaming",sourceId:"disney",ref:"stream-1",titel:"Star Wars"},{kind:"cinema",ref:"kino-1",titel:"Star Wars"}] },
    { rowId:"row-02", rank:2, title:"Star Wars: The Empire Strikes Back – eine absichtlich sehr lange Titelprobe für schmale Bildschirme", year:1980, mediaType:"film", state:"available", primaryTarget:{kind:"streaming",sourceId:"disney",ref:"stream-2",titel:"Empire"}, secondaryTargets:[] },
    { rowId:"row-03", rank:3, title:"Star Wars: Return of the Jedi", year:1983, mediaType:"film", state:"available", primaryTarget:{kind:"cinema",ref:"kino-3",titel:"Jedi"}, secondaryTargets:[] },
    { rowId:"row-04", rank:4, title:"Star Wars: Synthetic Missing Story", year:1984, mediaType:"film", state:"redlink", primaryTarget:null, secondaryTargets:[] },
    { rowId:"row-05", rank:5, title:"Rogue One", year:2016, mediaType:"film", state:"unchecked", primaryTarget:null, secondaryTargets:[] },
  ];
  const fixtureOutcomes = ${JSON.stringify({ failed: JSON.parse(fs.readFileSync(path.join(rootDir, "tests/fixtures/blog-contract-v1.json"), "utf8")).saveOutcomes.publishPartialFailure, unknown: JSON.parse(fs.readFileSync(path.join(rootDir, "tests/fixtures/blog-contract-v1.json"), "utf8")).saveOutcomes.publishUnknown })};
  function Harness(){
    const [view,setView]=useState({area:"mine",mode:"list",articleId:null,returnToken:null});
    const [editor,setEditor]=useState({draftKey:"draft-1",articleId:null,contentVersion:null,title:"",text:"",ordered:true,references:refs,anonymousPublication:false,dirty:false,saveStatus:"idle"});
    const [reader,setReader]=useState(null); const [redlinkForm,setRedlink]=useState(null); const [redlinkReturn,setRedlinkReturn]=useState(null);
    const [saveOutcome,setSaveOutcome]=useState("failed"); const [redlinkFails,setRedlinkFails]=useState(false);
    globalThis.blogSetSaveOutcome=setSaveOutcome; globalThis.blogSetRedlinkFails=setRedlinkFails;
    globalThis.blogSetReferenceCount=(count)=>setEditor(e=>({...e,references:[
      ...refs,
      ...Array.from({length:Math.max(0,count-refs.length)},(_,index)=>({rowId:"extra-"+index,rank:refs.length+index+1,title:"Zusätzlicher Titel "+(index+1),year:2000+(index%20),mediaType:"film",state:"redlink",primaryTarget:null,secondaryTargets:[]}))
    ].slice(0,count)}));
    globalThis.blogShowPublished=()=>setView({area:"published",mode:"list",articleId:null,returnToken:null});
    globalThis.blogNavigations=globalThis.blogNavigations||[];
    const cardRefs=refs.map(reference=>reference.rowId==="row-03"?{...reference,state:"redlink",primaryTarget:null,secondaryTargets:[]}:reference);
    const card={articleId:"article-1",title:"Meine sehr lange Star-Wars-Rangliste für einen schmalen Bildschirm",excerpt:"Eine vollständige Probe mit mehreren Referenzen und einem langen Auszug, der auf der Karte knapp bleibt.",updatedAt:"2032-05-04T11:00:00Z",displayState:"private_changes",ordered:false,referencePreview:cardRefs,publicationError:{status:"unknown",operationId:"operation-card-1",errorCode:null}};
    const otherCard={...card,articleId:"article-2",title:"Ein anderer geladener Artikel",referencePreview:[]};
    const actions={
      onNewArticle:()=>{setEditor(e=>({...e,articleId:null,title:"",text:"",anonymousPublication:false}));setView({area:"mine",mode:"editor",articleId:null,returnToken:"mine"});},
      onEditArticle:({articleId})=>{setEditor(e=>({...e,articleId,title:card.title,text:card.excerpt,anonymousPublication:false,saveStatus:{publicationId:"publication-1"}}));setView({area:"mine",mode:"editor",articleId,returnToken:"mine"});},
      onReadArticle:({scope,articleId,returnToken})=>{setReader({scope,article:{articleId,title:card.title,text:card.excerpt+"\\n\\nVoller gemeinsamer Lesertext.",ordered:true},referenceViews:refs,canEdit:scope==="private",returnToken:returnToken||"mine"});setView({area:scope==="published"?"published":"mine",mode:"reader",articleId,returnToken:returnToken||"mine"});},
      onBack:()=>setView({area:"mine",mode:"list",articleId:null,returnToken:null}),
      onEditorChange:(patch)=>setEditor(e=>({...e,...patch,dirty:true})),
      onAddReference:(input)=>{globalThis.blogAddedReference=input;setEditor(e=>({...e,references:[...e.references,{...input.reference,rowId:"added-"+e.references.length,rank:e.references.length+1,state:"redlink",primaryTarget:null,secondaryTargets:[]}]}));},
      onMoveReference:({rowId,direction})=>setEditor(e=>{const a=[...e.references].sort((x,y)=>x.rank-y.rank);const i=a.findIndex(x=>x.rowId===rowId);const j=direction==="up"?i-1:i+1;if(j<0||j>=a.length)return e;[a[i],a[j]]=[a[j],a[i]];return {...e,references:a.map((x,k)=>({...x,rank:k+1}))};}),
      onRemoveReference:({rowId})=>setEditor(e=>({...e,references:e.references.filter(x=>x.rowId!==rowId).map((x,k)=>({...x,rank:k+1}))})),
      onSave:async()=>editor.anonymousPublication ? fixtureOutcomes[saveOutcome] : {private:{status:"saved"},publication:{status:"not_requested",operationId:null}},
      onReferenceDecision:async()=>({status:"saved"}), onNavigateReference:({target})=>globalThis.blogNavigations.push(target),
      onOpenRedlinkForm:({articleId,rowId})=>{setRedlinkReturn(view);setRedlink({articleId:articleId||"article-1",rowId,status:"open",initial:{titel:"Star Wars: Synthetic Missing Story",jahr:1984,typ:"film"},errorCode:null});setView({area:view.area,mode:"redlink_form",articleId:articleId||"article-1",returnToken:"redlink"});},
      onCancelRedlinkForm:()=>setView(redlinkReturn||{area:"mine",mode:"list",articleId:null,returnToken:null}),
      onConfirmRedlinkForm:async()=>{if(redlinkFails)return {status:"failed",mediaWriteConfirmed:false,errorCode:"FIXTURE"};setEditor(e=>({...e,references:e.references.map(x=>x.rowId==="row-04"?{...x,state:"available",primaryTarget:{kind:"library",ref:"local-4",titel:x.title}}:x)}));setView(redlinkReturn||{area:"mine",mode:"editor",articleId:editor.articleId,returnToken:"mine"});return {status:"saved",mediaWriteConfirmed:true};},
      onRetryPublication:async(input)=>{globalThis.blogRetry=input;return null;},onWithdraw:async()=>({status:"withdrawn"}),onDelete:async()=>({private:{status:"deleted"}}),onLoadPublished:async()=>({status:"loaded"}),
    };
    return <BlogTab publicationCapability={{status:"ready",reason:null}} view={view} editor={editor} reader={reader} redlinkForm={redlinkForm} articleCards={[card]}
      publishedPage={{status:"ready",items:[card,otherCard],nextCursor:"fixture-next",complete:false,errorCode:null}} actions={actions}/>;
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
await page.getByLabel("Titel hinzufügen").fill("Andor"); await page.getByLabel("Typ").selectOption("serie");
await page.getByLabel("Jahr (optional)").fill("1200"); await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
await check("Unplausibles optionales Jahr bleibt im Hinzufügen-Bereich", async () => {
  assert.equal(await page.getByLabel("Jahr (optional)").inputValue(), "1200");
  assert.match(await page.getByRole("alert").innerText(), /Jahr muss leer oder eine ganze Zahl/);
  assert.equal(await page.evaluate(() => globalThis.blogAddedReference), undefined);
});
await page.getByLabel("Jahr (optional)").fill("2022"); await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
await check("Serie und Jahr werden über onAddReference konkret weitergegeben", async () => assert.deepEqual(
  await page.evaluate(() => globalThis.blogAddedReference),
  { draftKey: "draft-1", reference: { title: "Andor", year: 2022, mediaType: "serie" } },
));
await page.evaluate(() => globalThis.blogSetReferenceCount(49));
await page.getByLabel("Titel hinzufügen").fill("Fünfzigster Titel");
await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
await check("Beim Hinzufügen der 50. Referenz erscheint nur der kontextuelle Hinweis", async () => {
  assert.match(await page.getByRole("status").innerText(), /50\. Referenz/);
  assert.equal(await page.getByText(/50\/50 Titel/).count(), 0);
});
await page.getByLabel("Titel hinzufügen").fill("Einundfünfzigster Titel");
await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
await check("Ein Versuch über 50 wird erklärt, ohne die Liste zu verändern", async () => {
  assert.match(await page.getByRole("status").innerText(), /Mehr als 50 Referenzen/);
  assert.equal(await page.locator(".kd-blog-editor .kd-blog-reference-row").count(), 50);
});
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

await page.locator(".kd-blog-editor .kd-blog-reference-link.is-redlink").first().click();
await page.getByRole("heading", { name: "Rotlink ergänzen" }).waitFor();
await page.getByRole("button", { name: "← Zurück" }).click();
await check("Rotlink-Abbruch kehrt mit erhaltenem Entwurf zurück", async () => assert.equal(await page.getByLabel("Titel", { exact: true }).inputValue(), "Ein Titel"));
await page.locator(".kd-blog-editor .kd-blog-reference-link.is-redlink").first().click();
await page.evaluate(() => globalThis.blogSetRedlinkFails(true));
await page.getByText("Ohne Bewertung speichern").click(); await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
await page.getByText("Eintrag und Rotlink konnten nicht bestätigt gespeichert werden. Deine Eingabe bleibt erhalten.").waitFor();
await check("Fehlgeschlagene Rotlink-Bestätigung hält FilmForm und Eingabe offen", async () => {
  assert.equal(await page.getByPlaceholder("Titel *").inputValue(), "Star Wars: Synthetic Missing Story");
  assert.equal(await page.getByRole("heading", { name: "Rotlink ergänzen" }).isVisible(), true);
});
await page.evaluate(() => globalThis.blogSetRedlinkFails(false));
await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
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
    if (width === 320 && scheme === "dark") await page.screenshot({ path: "/private/tmp/kd-blog-ui-320-dark.png", fullPage: true });
  }
}

await page.getByRole("button", { name: "← Zurück" }).click();
await check("Karten zeigen höchstens drei schlichte Referenzzeilen", async () => assert.equal(await page.locator(".kd-blog-card .kd-blog-reference-row").count(), 3));
await check("Ränge auf Karten folgen nur ordered", async () => assert.equal(await page.locator(".kd-blog-card .kd-blog-reference-rank").first().innerText(), "·"));
await check("Karten lesen unknown aus publicationError.status", async () => assert.match(await page.locator(".kd-blog-card").getByText(/Veröffentlichung:/).innerText(), /Ergebnis wird geprüft/));
await page.getByLabel("Weitere Aktionen für Meine sehr lange Star-Wars-Rangliste für einen schmalen Bildschirm").click();
await page.getByRole("button", { name: "Veröffentlichung prüfen" }).click();
await check("Gezielte Wiederholung verwendet die kontrollierte operationId", async () => assert.equal(await page.evaluate(() => globalThis.blogRetry?.operationId), "operation-card-1"));
await page.getByLabel("Weitere Aktionen für Meine sehr lange Star-Wars-Rangliste für einen schmalen Bildschirm").click();
await page.locator(".kd-blog-card .kd-blog-reference-link.is-redlink").click();
await check("Karten-Rotlinks öffnen die Ergänzung mit Artikelkontext", async () => assert.equal(await page.getByRole("heading", { name: "Rotlink ergänzen" }).isVisible(), true));
await page.getByRole("button", { name: "← Zurück" }).click();
await page.getByRole("button", { name: "Lesen", exact: true }).click();
await check("Lesen zeigt den vollen Text und alle fünf Referenzen ohne Klappe", async () => {
  assert.match(await page.locator(".kd-blog-reader-text").innerText(), /Voller gemeinsamer Lesertext/);
  assert.equal(await page.locator(".kd-blog-reader .kd-blog-reference-row").count(), 5);
});
await check("Leser enthält keine Sortier- oder Löschmenüs", async () => assert.equal(await page.locator(".kd-blog-reader .kd-blog-reference-menu").count(), 0));
await page.getByRole("button", { name: "Star Wars: A New Hope: Kino öffnen" }).click();
await check("Sekundäres Kinoziel ist ein eigener dezenter Link", async () => assert.equal(await page.evaluate(() => globalThis.blogNavigations.at(-1)?.kind), "cinema"));
await page.setViewportSize({ width: 736, height: 760 }); await page.emulateMedia({ colorScheme: "light" });
await page.evaluate(() => { document.body.style.colorScheme = "light"; document.body.style.background = "#edeae3"; });
await check("Kurzer Titel und Quellenziel bleiben bei 736px in einer kompakten Zeile", async () => {
  const layout = await page.locator(".kd-blog-reader .kd-blog-reference-row").nth(2).evaluate((row) => {
    const title = row.querySelector(".kd-blog-reference-link").getBoundingClientRect();
    const sources = row.querySelector(".kd-blog-reference-sources").getBoundingClientRect();
    return { rowHeight: row.getBoundingClientRect().height, titleTop: title.top, sourcesTop: sources.top };
  });
  assert.ok(Math.abs(layout.titleTop - layout.sourcesTop) < 2);
  assert.ok(layout.rowHeight <= 46);
});
await check("Technische Disney-ID erscheint lesbar und kontrastreich", async () => {
  const disney = page.getByRole("button", { name: "Star Wars: A New Hope: Disney+ öffnen" });
  assert.equal(await disney.isVisible(), true);
  assert.equal(await disney.evaluate((element) => getComputedStyle(element).color), "rgb(87, 82, 92)");
});
await page.screenshot({ path: "/private/tmp/kd-blog-reader-736-light.png", fullPage: true });
await page.getByRole("button", { name: "← Zurück" }).click(); await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
await check("Neu, Lesen, Zurück und Bearbeiten bleiben direkte Wege", async () => assert.equal(await page.getByRole("heading", { name: "Artikel bearbeiten" }).isVisible(), true));
await check("Öffentliche Kopie plus Checkbox aus benennt die private Änderung", async () => {
  assert.equal(await page.getByRole("button", { name: "Änderungen privat speichern" }).isVisible(), true);
  assert.equal(await page.getByText("Die veröffentlichte Fassung bleibt unverändert.").isVisible(), true);
});

await page.evaluate(() => globalThis.blogShowPublished());
await page.getByLabel("Nach Titel suchen").fill("anderer");
await check("Veröffentlicht filtert nur geladene Titel und erklärt die Seitengrenze", async () => {
  assert.equal(await page.locator(".kd-blog-card").count(), 1);
  assert.match(await page.locator(".kd-blog-search").innerText(), /bereits geladenen Artikel/);
  assert.equal(await page.getByRole("button", { name: "Weitere laden" }).isVisible(), true);
});

await browser.close(); fs.rmSync(outdir, { recursive: true, force: true });
console.log(`blog_compact_ui_test: ${checks} Checks bestanden (echter Chromium, nur Fixtures).`);
