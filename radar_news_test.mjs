import assert from "node:assert/strict";
import { projectRadarNews, radarEpisodeIdentity, radarSearchStatusLabel } from "./src/lib/radarNews.js";
import { validateRadarPilotFeed, RADAR_PILOT_FEED_FORMAT } from "./src/lib/radarPilotContracts.js";
import { createEmptyLocalRadar, createLocalTextRadarTargetId, reconcileAccountRadarPilotFeed,
  decodeLocalRadar, changeLocalTextRadarSubscription, validateLocalRadarState,
} from "./src/lib/localEventRadar.js";

let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`✓ ${name}`); }
const today = "2026-08-31";
const now = `${today}T10:00:00.000Z`;
const episode = (number, extra = {}) => ({
  eventVersionId: `episode-${number}`, title: `Beispieldorf Staffel 29 Folge ${number}`,
  eventType: "staffelstart", targetType: "series", category: "series", seasonNumber: 29,
  verificationStatus: "confirmed", date: `2026-09-${String(number).padStart(2,"0")}`,
  platform: "Beispiel+", region: "AT", ...extra,
});
const five = [6,2,4,5,3].map((number) => episode(number));
check("Fünf eindeutige Folgen werden eine Staffel mit fünf sortierten Details, ohne Mutation", () => {
  const original = JSON.stringify(five);
  const [group] = projectRadarNews(five,today);
  assert.equal(projectRadarNews(five,today).length,1);
  assert.equal(group.title,"Beispieldorf · Staffel 29");
  assert.equal(group.category,"season");
  assert.deepEqual(group.episodes.map((entry) => entry.episodeNumber),[2,3,4,5,6]);
  assert.equal(group.date,"2026-09-02"); assert.equal(group.dateLabel,"Nächste Folge");
  assert.equal(JSON.stringify(five),original);
});
check("Film, Special, andere Serie und andere Staffel bleiben getrennt", () => {
  const others = [episode(7,{title:"Kinofilm",category:"film",targetType:"work"}),
    episode(8,{category:"special"}), episode(9,{title:"Anderes Dorf Staffel 29 Folge 9"}),
    episode(10,{title:"Beispieldorf Staffel 30 Folge 10",seasonNumber:30})];
  assert.equal(projectRadarNews([...five,...others],today).length,5);
});
check("Explizite DE-/EN-/SxxExx-Marker funktionieren ohne fuzzy matching", () => {
  for (const title of ["Beispieldorf Staffel 29 Folge 2", "Beispieldorf Season 29 Episode 2", "Beispieldorf S29E02: Nacht"]) {
    const parsed=radarEpisodeIdentity(episode(2,{title}));
    assert.equal(parsed.seriesTitle,"Beispieldorf"); assert.equal(parsed.episodeNumber,2);
  }
  assert.equal(radarEpisodeIdentity(episode(2,{title:"Beispieldorf S29E02: Nacht"})).episodeTitle,"Nacht");
});
check("Mehrdeutige Titel, Staffelwiderspruch und nackte Folgennummer werden nicht gruppiert", () => {
  for (const title of ["Beispieldorf Folge 2", "Beispieldorf 29 2", "Staffel 29 Folge 2",
    "Beispieldorf Staffel 29 Folge 2-3", "Beispieldorf Staffel 29 Folge 2 und 3",
    "Beispieldorf Staffel 29 Folge 2 / Staffel 30 Folge 3", "Beispieldorf Staffel 29 Folge 2: Episode 3"]) {
    assert.equal(radarEpisodeIdentity(episode(2,{title})),null,title);
  }
  assert.equal(radarEpisodeIdentity(episode(2,{seasonNumber:30})),null);
  assert.equal(projectRadarNews([episode(2),episode(3,{title:"Beispiel Dorf Staffel 29 Folge 3"})],today).length,2);
});
check("Nur belegte Premiere oder Folge 1 erlaubt Staffelstart; sonst nächster Termin", () => {
  assert.equal(projectRadarNews([episode(1),...five],today)[0].dateLabel,"Staffelstart");
  const premiere=episode(0,{title:"Beispieldorf Staffel 29",date:"2026-09-01",category:"season"});
  assert.equal(projectRadarNews([premiere,...five],today)[0].date,"2026-09-01");
  assert.equal(projectRadarNews([premiere,...five],today)[0].episodes.length,5);
  assert.equal(projectRadarNews(five,"2026-09-04")[0].date,"2026-09-04");
  assert.equal(projectRadarNews(five,"2026-10-01")[0].dateLabel,"Letzte Folge");
});
check("Plattform- oder Regionswiderspruch wird nicht auf die Staffel verallgemeinert", () => {
  for (const extra of [{platform:"Andere+"},{platform:undefined},{region:"global"}]) {
    const group=projectRadarNews([episode(2),episode(3,extra)],today)[0];
    assert.equal(group[Object.keys(extra)[0]],null);
    assert.equal(group.episodes.length,2);
  }
});

const targetText="Beispieldorf";
const targetId=createLocalTextRadarTargetId(targetText);
const subscription={targetId,targetType:"text",title:targetText,region:"AT",scope:"all",status:"active",updatedAt:now};
const feed={format:RADAR_PILOT_FEED_FORMAT,revision:1,checksum:"a".repeat(64),reconciledAt:now,
  subscriptions:[subscription],events:[],receipts:[],operationAcks:[],personResults:[],radarReview:true};
const status = (value="no_change") => ({targetId,status:value,checkedAt:value==="never"?null:now});
check("Alter Feed bleibt kompatibel und wird nie als nie gesucht ausgegeben", () => {
  assert.equal(validateRadarPilotFeed(feed).ok,true);
  const result=reconcileAccountRadarPilotFeed(createEmptyLocalRadar({authority:"account-cache"}),feed);
  assert.equal(result.ok,true);
  assert.equal(radarSearchStatusLabel(result.state.pilot.searchStatuses,targetId),"Suchstatus nicht verfügbar");
});
check("Suchstatus geht bei unveränderter Revision durch Cache/Reload, altes Backend entfernt ihn", () => {
  const result=reconcileAccountRadarPilotFeed(createEmptyLocalRadar({authority:"account-cache"}),{...feed,searchStatuses:[status()]});
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.deepEqual(result.state.pilot.searchStatuses,[status()]);
  const decoded=decodeLocalRadar(JSON.stringify(result.state),{authority:"account-cache"});
  assert.deepEqual(decoded.state.pilot.searchStatuses,[status()]);
  const changed=reconcileAccountRadarPilotFeed(decoded.state,{...feed,searchStatuses:[status("confirmed")]});
  assert.equal(changed.ok,true); assert.equal(changed.state.server.checksum,feed.checksum);
  assert.equal(changed.state.pilot.searchStatuses[0].status,"confirmed");
  assert.equal(reconcileAccountRadarPilotFeed(changed.state,feed).state.pilot.searchStatuses,undefined);
  const removed=changeLocalTextRadarSubscription(changed.state,{targetText,action:"remove",now});
  assert.equal(removed.ok,true); assert.equal(validateLocalRadarState(removed.state).ok,true);
});
check("Fehlende Status, fremde Ziel-IDs, Duplikate und ungültige Zeiten sind sicher", () => {
  for (const searchStatuses of [[{...status(),targetId:"text:foreign"}],[status(),status()],
    [{...status(),checkedAt:null}],[{...status("never"),checkedAt:now}], [{...status(),extra:true}],null]) {
    assert.equal(validateRadarPilotFeed({...feed,searchStatuses}).ok,false);
  }
  assert.doesNotThrow(() => validateRadarPilotFeed({...feed,subscriptions:{},searchStatuses:[status()]}));
});
check("Suche, Leerfund und abgelaufene Suche sind unterscheidbar, Cache behauptet kein laufendes Lease", () => {
  assert.equal(radarSearchStatusLabel([status("never")],targetId),"Noch keine Suche");
  assert.match(radarSearchStatusLabel([status()],targetId),/Zuletzt gesucht.*keine neuen Treffer/);
  assert.match(radarSearchStatusLabel([status("searching")],targetId),/Suche gestartet/);
  assert.doesNotMatch(radarSearchStatusLabel([status("searching")],targetId),/läuft/);
  assert.match(radarSearchStatusLabel([status("timeout")],targetId),/nicht abgeschlossen/);
});
console.log(`RADAR_NEWS: ${checks}/${checks} checks passed`);
