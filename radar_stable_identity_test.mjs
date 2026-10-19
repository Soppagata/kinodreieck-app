import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildRadarIdentityManifest,previewRadarIdentityManifest,radarStartSignature,radarExplicitEpisode,validateRadarIdentityProjection,projectStableRadarNews,radarClaimDatePrecision,radarClaimDateLabel} from './src/lib/radarStableIdentity.js';
const accountId=randomUUID(),workId=randomUUID();let checks=0;
const check=(name,fn)=>{fn();checks++;console.log('✓ '+name);};
const finding=(extra={})=>({finding_id:randomUUID(),event_version_id:randomUUID(),title:'Polarlicht Staffel 2',target_type:'series',event_type:'staffelstart',event_date:'2027-01-01',platform:'Disney+',region:'AT',season_number:2,source_url:'https://press.example/release',...extra});
const work={workId,title:'Polarlicht',targetType:'series',releaseYear:null,externalIds:{}};
const assignment=(f,extra={})=>({eventId:f.finding_id,workId,editionKey:'original',licenseKey:'subscription',reason:'Reviewed alias plus exact source, type and season.',...extra});
const manifest=(findings,assignments=findings.map(f=>assignment(f)),works=[work])=>buildRadarIdentityManifest({accountId,findings,assignments,works});
const a=finding(),b=finding({title:'Polarlicht Season 2',source_url:'https://press.example/release-en'});
check('Explizite Aliaszuordnung gruppiert denselben Start und lässt Originalfunde unverändert',()=>{
 const before=JSON.stringify([a,b]);const p=previewRadarIdentityManifest(manifest([a,b]));
 assert.equal(p.startCount,1);assert.equal(p.mergedCount,1);assert.equal(JSON.stringify([a,b]),before);
});
check('Titel und Datum allein erzeugen ohne freigegebene Zuordnung keinen Match',()=>{
 const p=previewRadarIdentityManifest(manifest([a,b],[assignment(a,{workId:null,editionKey:null,licenseKey:null}),assignment(b,{workId:null,editionKey:null,licenseKey:null})]));
 assert.equal(p.startCount,0);assert.equal(p.heldCount,2);
});
check('Plattform, Channel, Startart, Markt, Staffel, Folge, Edition und Lizenz bleiben getrennt',()=>{
 const base=radarStartSignature(a,assignment(a));
 for(const extra of [{platform:'Prime Video'},{platform:'Paramount+ via Prime Video'},{event_type:'serienstart'},{region:'global'},{region:'unspecified'},{season_number:3},{title:'Polarlicht Staffel 2 Folge 2'}]) assert.notEqual(radarStartSignature(finding(extra),assignment(a)),base);
 assert.notEqual(radarStartSignature(a,assignment(a,{editionKey:'reissue:2027'})),base);
 assert.notEqual(radarStartSignature(a,assignment(a,{licenseKey:'rent'})),base);
 const unknown=finding({platform:'-'});assert.notEqual(radarStartSignature(unknown,assignment(unknown)),radarStartSignature(finding({platform:'-'}),assignment(unknown)));
});
check('Datumswechsel behält dieselbe Startidentität mit offenem Konflikt',()=>{
 const later=finding({event_date:'2027-02-01'});const p=previewRadarIdentityManifest(manifest([a,later]));
 assert.equal(p.startCount,1);assert.equal(p.starts[0].status,'date-conflict');assert.deepEqual(p.starts[0].dates,['2027-01-01','2027-02-01']);
});
check('Mehrdeutiger Alias, fehlender Fund und widersprüchlicher Werktyp blockieren',()=>{
 const otherWork={...work,workId:randomUUID()};const clone=finding();
 assert.throws(()=>manifest([a,clone],[assignment(a),assignment(clone,{workId:otherWork.workId})],[work,otherWork]),/ambiguous/);
 assert.throws(()=>manifest([a,b],[assignment(a)]),/incomplete/);
 assert.throws(()=>manifest([a],[assignment(a)],[{...work,targetType:'work'}]),/type-mismatch/);
 assert.throws(()=>manifest([a],[assignment(a)],[{...work,externalIds:{imdb:'wrong'}}]),/work-invalid/);
});
check('Explizite Folgen sind keine Titelheuristik; widersprüchliche Marker blockieren',()=>{
 assert.equal(radarExplicitEpisode('Polarlicht S02E03'),3);assert.equal(radarExplicitEpisode('Polarlicht Staffel 2 Folge 2'),2);
 assert.equal(radarExplicitEpisode('Polarlicht Episode 2 Episode 3'),null);
 for(const title of ['Polarlicht Staffel 2 Folge 2 Episode 3','Polarlicht Staffel 2 Folge 2-3','Polarlicht Staffel 2 Folge 2 und 3','Polarlicht S02E02 / 03','Polarlicht Staffel 2 Folge 0']){const ambiguous=finding({title});assert.throws(()=>manifest([ambiguous]),/type-mismatch/);}
});
check('Monats- und Jahresversprechen werden nie als exakter erster oder letzter Tag bestätigt',()=>{
 assert.equal(radarClaimDatePrecision('2027-12-25','Ende 2027 ist das bisherige Ende erreicht'),'year');
 assert.equal(radarClaimDatePrecision('2027-01-01','Season 2 will drop in January 2027'),'month');
 assert.equal(radarClaimDatePrecision('2026-07-01','Die Serie startet am 1. Juli 2026'),'day');
 assert.equal(radarClaimDatePrecision('2026-11-18','Premiere am 18. November 2026'),'day');
 assert.equal(radarClaimDatePrecision('2026-06-01','No set release date; mid-2026'),'year');
 assert.equal(radarClaimDatePrecision('2027-01-01','Keine Datumsangabe'),'unknown');
 assert.match(radarClaimDateLabel('2027-12-25','Ende 2027'),/2027/);assert.doesNotMatch(radarClaimDateLabel('2027-12-25','Ende 2027'),/25/);
});
const startId=randomUUID();
const events=[a,b].map(f=>({eventId:f.finding_id,eventVersionId:f.event_version_id,title:f.title,targetType:f.target_type,eventType:f.event_type,platform:f.platform,region:f.region,seasonNumber:f.season_number,date:f.event_date,verificationStatus:'confirmed',sourceTargetKey:'text:text:1122334455667788'}));
const projection={format:'kd-radar-identities-v1',accountId,enabled:true,rows:events.map(e=>({eventId:e.eventId,eventVersionId:e.eventVersionId,workId,startId,title:work.title,episodeNumber:null,editionKey:'original',licenseKey:'subscription'})),history:events.map((e,i)=>({observationId:randomUUID(),eventId:e.eventId,eventVersionId:e.eventVersionId,startId,date:i?'2027-02-01':e.date,title:e.title,sourceUrl:'https://press.example/release',sourceDomain:'press.example',checkedAt:'2026-10-19T10:00:00Z',sourceClaim:i?'2027-02-01':'2027-01-01'}))};
check('Cache ist an Konto, Original-UUID, aktuelle Version und vollständige Quellen gebunden',()=>{
 assert.equal(validateRadarIdentityProjection(projection,{accountId,events}).ok,true);
 assert.equal(validateRadarIdentityProjection(projection,{accountId:randomUUID(),events}).ok,false);
 assert.equal(validateRadarIdentityProjection({...projection,rows:[{...projection.rows[0],eventVersionId:randomUUID()}]},{accountId,events}).ok,false);
 assert.equal(validateRadarIdentityProjection({...projection,history:[]},{accountId,events}).ok,false);
 assert.equal(validateRadarIdentityProjection(projection,{events:[events[0],{...events[1],platform:'Prime Video'}]}).ok,false);
});
check('Neue Ansicht zeigt einen Werkblock mit Belegen und keinem erfundenen Gewinnerdatum',()=>{
 const before=JSON.stringify(events);const p=projectStableRadarNews(events,'2026-10-19',projection);
 assert.equal(p.groups.length,1);assert.equal(p.groups[0].starts.length,1);assert.equal(p.groups[0].starts[0].dateConflict,true);
 assert.equal(p.groups[0].starts[0].history.length,2);assert.equal(JSON.stringify(events),before);
 const changed=events.map(e=>({...e,eventVersionId:randomUUID()}));assert.equal(projectStableRadarNews(changed,'2026-10-19',projection).unmapped.length,2);
});
console.log(`${checks} Radar-Identitätsprüfungen bestanden.`);
