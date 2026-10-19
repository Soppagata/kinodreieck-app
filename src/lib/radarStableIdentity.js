/* Versioned, deterministic Radar identity. Original events/receipts stay intact.
   A title is never sufficient: accepted aliases are guarded by work type,
   source URL, season and episode. Dates are observations, never identity. */
export const RADAR_STABLE_FEED_FORMAT = "kd-radar-stable-feed-v1";
export const RADAR_IDENTITY_FORMAT = "kd-radar-identities-v1";
export const RADAR_IDENTITY_MANIFEST_FORMAT = "kd-radar-identity-manifest-v1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const plain = (v) => v && typeof v === "object" && !Array.isArray(v);
const keys = (v, required) => plain(v) && Object.keys(v).length === required.length && required.every((k) => Object.hasOwn(v,k));
const integer = (v, max) => v === null || (Number.isInteger(v) && v > 0 && v <= max);
const label = (v, max = 200) => typeof v === "string" && v === v.trim() && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f-\u009f]/u.test(v);
const day = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
const url = (v) => { try { const u=new URL(v);return u.protocol === "https:" && !u.username && !u.password && !u.port && !u.hash; } catch { return false; } };
const copy = (v) => JSON.parse(JSON.stringify(v));

export function radarAliasTitle(value) {
  return String(value ?? "").normalize("NFC").trim().replace(/ +/g," ").replace(/[A-Z]/g,(c)=>c.toLowerCase());
}

const MONTHS = ["januar|jänner|jaenner|january|jan", "februar|february|feb", "märz|maerz|march|mar", "april|apr", "mai|may", "juni|june|jun", "juli|july|jul", "august|aug", "september|sept|sep", "oktober|october|okt|oct", "november|nov", "dezember|december|dez|dec"];
// Precision comes only from the persisted claim, never from a convenient day
// invented by a provider. This is a display hint, not a factual source audit.
export function radarClaimDatePrecision(date, claim) {
  if (!day(date) || typeof claim !== "string") return "unknown";
  const [year, month, dateDay] = date.split("-").map(Number);
  const d = `0?${dateDay}`, m = `0?${month}`, word = `(?:${MONTHS[month-1]})\\.?`;
  const numeric = new RegExp(`(?:^|[^0-9])${d}[./]${m}[./]${year}(?![0-9])`, "iu");
  const named = new RegExp(`(?:\\b${d}(?:\\.|st|nd|rd|th)?\\s+${word}\\s+${year}\\b|\\b${word}\\s+${d}(?:st|nd|rd|th)?[,]?\\s+${year}\\b)`,"iu");
  if (new RegExp(`(?:^|[^0-9])${date}(?![0-9])`,"u").test(claim) || numeric.test(claim) || named.test(claim)) return "day";
  if (new RegExp(`\\b${word}\\s+${year}\\b`,"iu").test(claim)) return "month";
  if (new RegExp(`\\b${year}\\b`,"u").test(claim)) return "year";
  return "unknown";
}
export function radarClaimDateLabel(date, claim) {
  const precision=radarClaimDatePrecision(date,claim);
  if(precision === "day") return date;
  if(precision === "month") return new Intl.DateTimeFormat("de-AT",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${date}T12:00:00Z`));
  if(precision === "year") return `${date.slice(0,4)} (Zeitraum nicht taggenau)`;
  return "Datum nicht ausreichend belegt";
}

function radarEpisodeMarkerConflict(title) {
  const matches=[...String(title || "").matchAll(/(?:\b(?:folge|episode)\s+(\d{1,4})\b|\bS\d{1,3}\s*E(\d{1,4})\b)/giu)];
  if(matches.length > 1) return true;
  if(matches.length !== 1) return false;
  if(Number(matches[0][1] || matches[0][2]) < 1) return true;
  const tail=String(title).slice(matches[0].index+matches[0][0].length);
  return /^\s*(?:[-–—/&]\s*\d|(?:und|and|bis|to)\b)/iu.test(tail);
}
export function radarExplicitEpisode(title) {
  const matches=[...String(title || "").matchAll(/(?:\b(?:folge|episode)\s+(\d{1,4})\b|\bS\d{1,3}\s*E(\d{1,4})\b)/giu)];
  if(matches.length !== 1 || radarEpisodeMarkerConflict(title)) return null;
  const n=Number(matches[0][1] || matches[0][2]);
  return n > 0 ? n : null;
}

// Literal offer/market/type distinctions are intentionally retained. Unknown
// streaming offers remain finding-specific until a separate evidence decision.
export function radarStartDimensions(finding, assignment) {
  const platform=finding.platform;
  const unknown= ["-","unknown","unbekannt","n/a"].includes(radarAliasTitle(platform));
  return {
    workId:assignment.workId,
    eventType:finding.event_type,
    offerKey:finding.event_type === "kinostart_at" && platform === "-" ? "cinema"
      : unknown ? `unresolved:${finding.finding_id}` : `literal:${platform}`,
    region:finding.region,
    seasonNumber:finding.season_number ?? null,
    episodeNumber:radarExplicitEpisode(finding.title),
    editionKey:assignment.editionKey,
    licenseKey:assignment.licenseKey,
  };
}
export function radarStartSignature(finding, assignment) {
  return JSON.stringify(Object.values(radarStartDimensions(finding,assignment)));
}

export function validateRadarIdentityProjection(value, {accountId, events} = {}) {
  const errors=[];
  if(!keys(value,["format","accountId","enabled","rows","history"]) || value.format !== RADAR_IDENTITY_FORMAT
      || !UUID.test(value.accountId) || (accountId !== undefined && value.accountId !== accountId)
      || typeof value.enabled !== "boolean" || !Array.isArray(value.rows) || !Array.isArray(value.history))
    return {ok:false,errors:["identity-shape-invalid"]};
  if(!value.enabled && (value.rows.length || value.history.length)) errors.push("identity-disabled-data");
  const byVersion=events ? new Map(events.map((e)=>[e.eventVersionId,e])) : null;
  const seen=new Set();
  const starts=new Map();
  for(const row of value.rows){
    if(!keys(row,["eventId","eventVersionId","workId","startId","title","episodeNumber","editionKey","licenseKey"])
        || ![row.eventId,row.eventVersionId,row.workId,row.startId].every((v)=>UUID.test(v))
        || !label(row.title) || !integer(row.episodeNumber,9999) || !label(row.editionKey,120) || !label(row.licenseKey,120)){
      errors.push("identity-row-invalid");continue;
    }
    if(seen.has(row.eventVersionId)) errors.push("identity-row-duplicate");seen.add(row.eventVersionId);
    const event=byVersion?.get(row.eventVersionId);
    if(byVersion && (!event || event.eventId !== row.eventId || radarExplicitEpisode(event.title) !== row.episodeNumber)) errors.push("identity-event-mismatch");
    if(event){
      const dimension=JSON.stringify([row.workId,event.targetType,event.eventType,event.platform,event.region,event.seasonNumber??null,row.episodeNumber,row.editionKey,row.licenseKey]);
      if(starts.has(row.startId) && starts.get(row.startId) !== dimension) errors.push("identity-start-boundary-mismatch");
      starts.set(row.startId,dimension);
    }
  }
  const visibleStarts=new Set(value.rows.map((r)=>r.startId));
  const observations=new Set();
  for(const row of value.history){
    if(!keys(row,["observationId","eventId","eventVersionId","startId","date","title","sourceUrl","sourceDomain","checkedAt","sourceClaim"])
        || ![row.observationId,row.eventId,row.eventVersionId,row.startId].every((v)=>UUID.test(v))
        || !visibleStarts.has(row.startId) || !day(row.date) || !label(row.title)
        || !url(row.sourceUrl) || !label(row.sourceDomain,253) || !label(row.sourceClaim,500) || !Number.isFinite(Date.parse(row.checkedAt))
        || new URL(row.sourceUrl).hostname !== row.sourceDomain) errors.push("identity-history-invalid");
    if(observations.has(row.observationId)) errors.push("identity-observation-duplicate");observations.add(row.observationId);
  }
  for(const row of value.rows){
    if(!value.history.some((h)=>h.eventId === row.eventId && h.eventVersionId === row.eventVersionId && h.startId === row.startId)) errors.push("identity-current-observation-missing");
  }
  return {ok:errors.length === 0,errors:[...new Set(errors)]};
}

// Caller supplies an explicitly reviewed work assignment per finding. This
// function proposes nothing from title similarity and performs no I/O/write.
export function buildRadarIdentityManifest({accountId, findings, works, assignments}) {
  if(!UUID.test(accountId) || !Array.isArray(findings) || !Array.isArray(works) || !Array.isArray(assignments)) throw new Error("identity-input-invalid");
  const workMap=new Map(works.map((w)=>[w.workId,w]));
  if(workMap.size !== works.length) throw new Error("identity-work-duplicate");
  for(const w of works){
    if(!keys(w,["workId","title","targetType","releaseYear","externalIds"])
        || !UUID.test(w.workId) || !label(w.title) || !["work","series"].includes(w.targetType)
        || !(w.releaseYear === null || (Number.isInteger(w.releaseYear) && w.releaseYear >= 1888 && w.releaseYear <= 2100))
        || !plain(w.externalIds) || Object.entries(w.externalIds).some(([k,v])=>typeof v!=="string" || (k==="imdb" ? !/^tt\d{7,10}$/.test(v) : !["tmdb","watchmode"].includes(k) || !/^[1-9]\d{0,11}$/.test(v)))) throw new Error("identity-work-invalid");
  }
  const findingMap=new Map(findings.map((f)=>[f.finding_id,f]));
  const assigned=new Set();const guards=new Map();
  for(const a of assignments){
    if(!keys(a,["eventId","workId","editionKey","licenseKey","reason"]) || assigned.has(a.eventId) || !findingMap.has(a.eventId)
        || !label(a.reason,500) || (a.workId === null ? a.editionKey !== null || a.licenseKey !== null : !workMap.has(a.workId) || !label(a.editionKey,120) || !label(a.licenseKey,120))) throw new Error("identity-assignment-invalid");
    assigned.add(a.eventId);
    if(a.workId === null) continue;
    const f=findingMap.get(a.eventId);const w=workMap.get(a.workId);
    if(w.targetType !== f.target_type || !url(f.source_url) || radarEpisodeMarkerConflict(f.title)) throw new Error("identity-assignment-type-mismatch");
    const guard=JSON.stringify([radarAliasTitle(f.title),f.target_type,f.source_url,f.event_type,f.platform,f.region,f.season_number??null,radarExplicitEpisode(f.title)]);
    const target=JSON.stringify([a.workId,a.editionKey,a.licenseKey]);
    if(guards.has(guard) && guards.get(guard) !== target) throw new Error("identity-alias-ambiguous");
    guards.set(guard,target);
  }
  if(assigned.size !== findings.length || findingMap.size !== findings.length) throw new Error("identity-incomplete-snapshot");
  return {format:RADAR_IDENTITY_MANIFEST_FORMAT,accountId,snapshot:copy(findings),works:copy(works),assignments:copy(assignments)};
}

export function previewRadarIdentityManifest(manifest, {uuidForStart} = {}) {
  const checked=buildRadarIdentityManifest({accountId:manifest.accountId,findings:manifest.snapshot,works:manifest.works,assignments:manifest.assignments});
  const workMap=new Map(checked.works.map((w)=>[w.workId,w]));
  const assignmentMap=new Map(checked.assignments.map((a)=>[a.eventId,a]));
  const groups=new Map();const held=[];
  for(const f of checked.snapshot){
    const a=assignmentMap.get(f.finding_id);
    if(a.workId === null){held.push({finding:copy(f),reason:a.reason});continue;}
    const key=radarStartSignature(f,a);
    const group=groups.get(key) || {key,startId:uuidForStart?.(key) || null,work:workMap.get(a.workId),dimensions:radarStartDimensions(f,a),findings:[],reasons:[]};
    group.findings.push(copy(f));group.reasons.push(a.reason);groups.set(key,group);
  }
  const starts=[...groups.values()].map((g)=>({...g,dates:[...new Set(g.findings.map((f)=>f.event_date))].sort(),status:new Set(g.findings.map((f)=>f.event_date)).size > 1 ? "date-conflict" : "matched"}));
  return {accountId:checked.accountId,originalCount:checked.snapshot.length,workCount:new Set(starts.map((s)=>s.work.workId)).size,startCount:starts.length,heldCount:held.length,mergedCount:starts.reduce((n,s)=>n+s.findings.length-1,0),starts,held};
}

// Used only after the versioned transport/cache has been validated against the
// complete account feed. Filtering receipts can remove some original events;
// exact event+version references prevent stale cache from binding newer ones.
export function projectStableRadarNews(events, today, identity) {
  if(!validateRadarIdentityProjection(identity).ok || identity.enabled !== true) return {groups:[],unmapped:events};
  const mappings=new Map(identity.rows.map((r)=>[`${r.eventId}|${r.eventVersionId}`,r]));
  const unmapped=[];const starts=new Map();
  for(const e of events){
    const m=mappings.get(`${e.eventId}|${e.eventVersionId}`);
    if(!m){unmapped.push(/^release:v[12]:/.test(e.targetId || "") ? {...e,identityUnresolved:true} : e);continue;}
    const s=starts.get(m.startId) || {kind:"start",startId:m.startId,workId:m.workId,title:m.title,editionKey:m.editionKey,licenseKey:m.licenseKey,episodeNumber:m.episodeNumber,members:[]};
    s.members.push(e);starts.set(m.startId,s);
  }
  const works=new Map();
  for(const s of starts.values()){
    const dims=new Set(s.members.map((e)=>JSON.stringify([e.targetType,e.eventType,e.platform,e.region,e.seasonNumber??null,radarExplicitEpisode(e.title)])));
    if(dims.size !== 1){unmapped.push(...s.members);continue;}
    const history=identity.history.filter((h)=>h.startId === s.startId);
    const dates=[...new Set(history.map((h)=>h.date))].sort();
    if(!dates.some((date)=>date >= today)) continue;
    const e=s.members[0];
    const start={...s,date:dates.find((d)=>d>=today),dates,dateConflict:dates.length > 1,eventType:e.eventType,platform:e.platform,region:e.region,seasonNumber:e.seasonNumber??null,history,sourceTargetKeys:[...new Set(s.members.map((x)=>x.sourceTargetKey).filter(Boolean))]};
    const w=works.get(s.workId) || {...e,kind:"work",eventVersionId:`work:${s.workId}`,workId:s.workId,title:s.title,starts:[],sourceTargetKeys:[]};
    w.starts.push(start);works.set(s.workId,w);
  }
  for(const w of works.values()){
    w.starts.sort((a,b)=>`${a.date}|${a.startId}`.localeCompare(`${b.date}|${b.startId}`));
    w.date=w.starts[0].date;w.sourceTargetKeys=[...new Set(w.starts.flatMap((s)=>s.sourceTargetKeys))];
  }
  return {groups:[...works.values()],unmapped};
}
