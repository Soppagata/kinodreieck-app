import { toggleGesehenInStatus } from "./src/lib/staffeln.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMotnStreaming } from "./src/lib/streamingMotn.js";
import { projiziereStreamingNeu, STREAMING_NEU_DAUER_MS } from "./src/lib/streamingNeu.js";
import { streamingTitelKennung, gleicheStreamingTitel, streamingStatus } from "./src/lib/streamingProjection.js";
import { normalizeMotnPage } from "./supabase/functions/_shared/motnData.js";
import { baueStreamingAnsichten } from "./src/lib/katalog.js";
import { localRecommendationCandidates } from "./src/lib/entdeckenUi.js";
import { createEntdeckenPin, resolveEntdeckenPins } from "./src/lib/entdeckenPins.js";

const at = Date.parse("2026-09-13T14:00:00Z");
const start = "2026-09-01T10:00:00Z";
const show = { motn_id: "1364", imdb_id: "tt1302011", tmdb_id: 49444, titel: "Kung Fu Panda 2", typ: "film", jahr: 2011,
  at_subscription_services: ["disney", "prime"] };
const offer = extra => ({ show_id: "1364", service_id: "disney", country: "AT", available: true,
  event_at: start, added_at: start, checked_at: new Date(at).toISOString(),
  link: "https://www.disneyplus.com/browse/fixture", show_data: show, ...extra });
const envelope = (...offers) => ({ format: 1, country: "AT", offers });
const wm = { watchmode_id: 1209560, imdb_id: "tt1302011", tmdb_id: 49444, titel: "Kung Fu Panda 2", typ: "movie", jahr: 2011,
  dienste: ["Netflix", "Paramount+ (Via Amazon Prime)"], web_urls: {Netflix:"https://netflix.com/old"} };
const projection = (titles,now=at) => projiziereStreamingNeu({ bekannt: {titel:[]}, entdecken: {titel:titles},
  auswahl:["Disney+"], auswahlGeladen:true, vollstaendig:true, now });

test("AT MotN corrects stale Netflix, adds Disney, and preserves Prime channels", () => {
  const result = applyMotnStreaming([wm],envelope(offer()),at);
  assert.equal(result.length,1); assert.equal(result[0].watchmode_id,1209560);
  assert.deepEqual(result[0].dienste,["Paramount+ (Via Amazon Prime)","Disney+"]);
  assert.equal(result[0].web_urls.Netflix,undefined);
  assert.deepEqual(wm.dienste,["Netflix","Paramount+ (Via Amazon Prime)"]);
});

test("Missing Watchmode titles survive 14 days, then leave Neu without leaving the catalog", () => {
  const result = applyMotnStreaming([],envelope(offer()),at);
  assert.equal(streamingTitelKennung(result[0]),"motn:1364");
  assert.equal(result[0].watchmode_id,null);
  assert.deepEqual(projection(result).neueIds,["motn:1364"]);
  const expiry = Date.parse(start)+STREAMING_NEU_DAUER_MS;
  assert.deepEqual(projection(result,expiry-1).neueIds,["motn:1364"]);
  assert.deepEqual(projection(result,expiry).neueIds,[]);
  assert.equal(applyMotnStreaming([],envelope(offer()),expiry+1).length,1);
});

test("Watchmode catch-up creates neither duplicates nor a new 14-day window", () => {
  const later=Date.parse(start)+STREAMING_NEU_DAUER_MS+1;
  const caught={...wm,dienste:["Disney+"],dienst_diffs:[{dienst:"Disney+",vorher:false,nachher:true,erkannt_am:new Date(later).toISOString()}]};
  const result=applyMotnStreaming([caught],envelope(offer()),later);
  assert.equal(result.length,1); assert.equal(result[0].motn_id,"1364");
  assert.equal(result[0].dienst_diffs.length,0); assert.deepEqual(projection(result,later).neueIds,[]);
  const handedBack=applyMotnStreaming([{...caught,dienste:[]}],envelope(offer({watchmode_seen_at:new Date(at).toISOString()})),later);
  assert.equal(handedBack.length,0);
});

test("Explicit removal keeps overriding later Watchmode runs and retains other providers", () => {
  const removed=offer({service_id:"netflix",available:false,link:null,added_at:null});
  for(const time of [at,at+86400000]) {
    const result=applyMotnStreaming([wm],envelope(removed),time);
    assert.deepEqual(result[0].dienste,["Paramount+ (Via Amazon Prime)"]);
  }
});

test("Conflicting or ambiguous IDs never attach availability, and other countries are ignored", () => {
  assert.equal(applyMotnStreaming([{...wm,tmdb_id:999}],envelope(offer()),at)[0].dienste.includes("Disney+"),false);
  assert.equal(applyMotnStreaming([wm,{...wm,watchmode_id:987}],envelope(offer()),at).filter(t=>t.dienste.includes("Disney+")).length,0);
  assert.deepEqual(applyMotnStreaming([],envelope(offer({country:"DE"})),at),[]);
});

test("A newer full AT snapshot prevents an older removal from hiding a returned subscription",()=>{
  const old=offer({service_id:"netflix",available:false,link:null,checked_at:"2026-09-10T00:00:00Z"});
  const newer=offer({show_data:{...show,at_subscription_services:["netflix","disney"],
    at_subscription_offers:[{service:"netflix",link:"https://netflix.com/returned",added_at:start},{service:"disney",link:"https://disneyplus.com/fixture",added_at:start}]}});
  const result=applyMotnStreaming([wm],envelope(old,newer),at);
  assert.ok(result[0].dienste.includes("Netflix"));
  assert.equal(result[0].web_urls.Netflix,"https://netflix.com/returned");
});

test("MotN-only films are eligible for local Entdecken and can be pinned",()=>{
  const titles=applyMotnStreaming([],envelope(offer()),at);
  const candidates=localRecommendationCandidates({region:"AT",titel:titles},{selectedServices:["Disney+"]});
  assert.equal(candidates.length,1);assert.equal(candidates[0].targetId,"motn:1364");
  const pin = createEntdeckenPin(titles[0],at);
  assert.ok(pin);
  const resolved = resolveEntdeckenPins([pin], { streaming: titles, streamingReady: true });
  assert.equal(resolved.resolved[0].target.ref, "motn:1364");
});

test("The regular catalog pipeline retains MotN-only titles and matches them to Mediathek", () => {
  const base={stand:new Date(at).toISOString(),region:"AT",katalog_stand:new Date(at).toISOString(),titel:[]};
  const data={bekannt:base,entdecken:{...base,motn:envelope(offer())}};
  const empty=baueStreamingAnsichten(data,[]);
  assert.equal(empty.entdecken.titel.length,1);
  const matched=baueStreamingAnsichten(data,[{id:"fixture-library",titel:show.titel,jahr:2011,typ:"film",imdb_id:show.imdb_id,tmdb_id:49444}]);
  assert.equal(matched.bekannt.titel.length,1);
  assert.equal(streamingTitelKennung(matched.bekannt.titel[0]),"motn:1364");
});

test("Removal without a link is valid; another current subscription prevents false removal", () => {
  const raw={itemType:"show",id:"1364",imdbId:"tt1302011",tmdbId:"movie/49444",title:"Kung Fu Panda 2",showType:"movie",releaseYear:2011,
    streamingOptions:{at:[{service:{id:"disney"},type:"subscription",link:"https://www.disneyplus.com/fixture",availableSince:Math.floor(Date.parse(start)/1000)}]}};
  const change={changeType:"removed",itemType:"show",showId:"1364",showType:"movie",service:{id:"disney"},streamingOptionType:"subscription",timestamp:Math.floor(at/1000)-10};
  const options={type:"removed",from:Math.floor(at/1000)-60,to:Math.floor(at/1000),checkedAt:new Date(at).toISOString(),catalogs:["disney.subscription"]};
  const page={changes:[change],shows:{1364:raw},hasMore:false};
  assert.equal(normalizeMotnPage(page,options).records[0].available,true);
  raw.streamingOptions={};
  const removed=normalizeMotnPage(page,options).records[0];
  assert.equal(removed.available,false); assert.equal(removed.link,null);
  change.streamingOptionType="rent";
  assert.throws(()=>normalizeMotnPage(page,options),/MOTN_CHANGE_SCOPE_MISMATCH/);
});

test("Watchmode catch-up keeps bookmarks and seen-state, including removing that state", () => {
  const old = { streaming_id: "motn:1364" };
  const current = applyMotnStreaming([wm], envelope(offer()), at)[0];
  assert.equal(gleicheStreamingTitel(old, current), true);
  const status = { "motn:1364": "gesehen" };
  assert.equal(streamingStatus(status,current), "gesehen");
  const cleared = toggleGesehenInStatus(status,current);
  assert.equal(streamingStatus(cleared,current), undefined);
  assert.equal(gleicheStreamingTitel({}, {}), false);
});
