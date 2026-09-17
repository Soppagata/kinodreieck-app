import copy,datetime,hashlib,json,re,shutil,subprocess
from pathlib import Path
R=Path('/private/tmp/kd-review49-benefit-audit-20260917')
O=Path('/private/tmp/kd-review49-benefit-delta-20260917')
P=Path('/private/tmp/kd-review49-benefit-audit-evidence-20260917')
OLD='a69a32be51d8258fc4604d925f03ff35d74b4da6'; NEW='9d88b7dc1e27a8580f5b223400ac8b7535ed003a'; BASE='14804ce389d69114feed27b92fb11ac78423cc0e'
def git(*args): return subprocess.check_output(['git',*args],cwd=R,stderr=subprocess.PIPE)
def sha(b): return hashlib.sha256(b).hexdigest()
def dump(name,d): (O/name).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
assert git('rev-parse','HEAD').decode().strip()==NEW
assert git('status','--porcelain=v1')==b''
prior=json.loads((P/'REVIEW.json').read_text())
principal={'KD-REV-E07-002','KD-REV-E08-001','KD-REV-E08-002','KD-REV-E10-004'}
changed=git('diff','--name-only',OLD,NEW,'--','src','supabase','tools','.github').decode().splitlines()
assert len(changed)==9
(O/'product-delta.patch').write_bytes(git('diff','--binary',OLD,NEW,'--',*changed))
(O/'test-delta.patch').write_bytes(git('diff',OLD,NEW,'--','package.json','review49_p06_sql_test.mjs'))
source_manifest=[]
for f in changed:
 data=(R/f).read_bytes(); target=O/'source-snapshots'/f;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 try: old=git('show',f'{OLD}:{f}'); oldhash=sha(old)
 except subprocess.CalledProcessError: oldhash=None
 source_manifest.append({'file':f,'candidateSha256':sha(data),'previousSha256':oldhash,'snapshot':str(target.relative_to(O))})
for f in ['R-P05.md','R-P06.md','R-P08.md']:
 target=O/'owner-evidence'/f;target.parent.mkdir(exist_ok=True);shutil.copyfile(R/'docs/review/2026-09-fixes/evidence'/f,target)
for f in ['REVIEW.json','REVIEW.md','source-manifest.json','ARTIFACT_SHA256.json']:
 target=O/'prior-audit'/f;target.parent.mkdir(exist_ok=True);shutil.copyfile(P/f,target)
for f in ['review49_rollout_p05_pg17_test.mjs','review49_rollout_p06_function_test.mjs','review49_rollout_p06_function_cases.ts','review49_rollout_p06_sql_test.mjs','review49_rollout_p08_pg17_test.mjs','tests/fixtures/review49_rollout_p08_readers.mjs','tests/fixtures/review49_p08_feed.mjs','review49_p06_sql_test.mjs','review49_p05_partial_test.mjs','review49_p08_entdecken_test.mjs']:
 target=O/'test-snapshots'/f;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(R/f,target)
carry=[]; issues=copy.deepcopy(prior['issues'])
for issue in issues:
 f=issue['originalTicket']; assert sha((R/f).read_bytes())==issue['originalTicketSha256']
 checks=[]
 for loc in issue['sourceLocations']:
  f=loc['file']; old=git('show',f'{OLD}:{f}'); new=(R/f).read_bytes()
  oldlines=old.decode().splitlines(); newlines=new.decode().splitlines()
  assert oldlines[loc['line']-1].strip()==loc['excerpt'].strip(),(issue['id'],loc)
  # Stable 41-line source neighborhood provides stronger evidence than a bare matching anchor.
  lo=max(0,loc['line']-21); hi=min(len(oldlines),loc['line']+20)
  neighborhood='\n'.join(oldlines[lo:hi]); npos='\n'.join(newlines).find(neighborhood)
  matches=[n+1 for n,l in enumerate(newlines) if l.strip()==loc['excerpt'].strip()]
  assert matches,(issue['id'],loc)
  if npos>=0:
   newstart='\n'.join(newlines)[:npos].count('\n'); newline=newstart+(loc['line']-1-lo)+1
  else: newline=min(matches,key=lambda x:abs(x-loc['line']))
  checks.append({'file':f,'previousLine':loc['line'],'currentLine':newline,'fileUnchanged':old==new,'previousSha256':sha(old),'candidateSha256':sha(new),'sourceNeighborhoodUnchanged':npos>=0,'oldNeighborhoodLines':[lo+1,hi],'neighborhoodSha256':sha(neighborhood.encode())})
  loc['line']=newline
 if issue['id'] not in principal:
  assert all(c['fileUnchanged'] or c['sourceNeighborhoodUnchanged'] for c in checks),issue['id']
 carry.append({'id':issue['id'],'originalTicketUnchanged':True,'mode':'TARGETED_DELTA' if issue['id'] in principal else 'CARRIED_FORWARD','sourceChecks':checks})
 issue['candidateCommit']=NEW
 issue['deltaMode']='TARGETED_DELTA' if issue['id'] in principal else 'CARRIED_FORWARD'
 issue['priorEvidence']='prior-audit/REVIEW.json; vollständige unveränderte ursprüngliche Logs unter docs/review/2026-09-fixes/evidence/benefit-audit am Kandidaten'
 issue['sourceVerification']='source-carryforward.json#'+issue['id']
 issue['rolloutStatus']='LOKAL BEWERTET; AUSLIEFERUNG NICHT BELEGT'
 issue['rolloutRequirement']='Separater Lieferauftrag, richtige Reihenfolge und gezielte Remote-/Altclient-Readbacks; keine Remoteausführung durch diesen Prüfer.'
 for c in issue['criteria']:
  c['provenance']='Fortgeschriebener eigener unabhängiger Erstbefund am vorherigen Kandidaten; unveränderte betroffene Quellen geprüft.'

p05=['review49_rollout_p05_pg17_test.log','review49_p05_partial_test.log']
p06=['review49_rollout_p06_function_test.log','review49_rollout_p06_sql_test.log','review49_p06_sql_test.log']
p08=['probe-p08-read-matrix.log','probe-p08-read-matrix.json','review49_p08_entdecken_test.log']
updates={
'KD-REV-E07-002':{
 'logs':p08,'rollout':'R-P08',
 'benefit':'Neue Leser behalten sicher identifizierte ÖFI-Belege; alte Leser behalten alle50 Streaming-Basiseinträge trotz gespeichertem annotations-Feld.',
 'behaviorChange':'Exaktes Accept-Opt-in erhält annotations; alte, fehlende oder unbekannte Accept-Werte erhalten nur bei Browser-GET eine nicht mutierende Basisprojektion. Vollständiger Producer-/Speicher-/Readbackvertrag bleibt erhalten.',
 'riskAndComplexity':'Kleine versionsbezogene HTTP-Projektion plus Accept/Vary. Alte Clients sehen weiterhin keine neue ÖFI-Karte; sie verlieren keinen Basispool. Headernormalisierung zu anderen Werten fällt sicher auf den Basispool zurück. Kein neuer SQL-Patch.',
 'evidence':[
  'Unveränderte Producer/SQL/Kartenkette aus Erstprüfung fortgeschrieben;34 aktuelle Produktfälle und eigene tatsächliche Alt/Neu-Handler-Serviceprobe liefern neue ÖFI-Karte mit unveränderten Metadaten und50 Basiseinträgen.',
  'Formate8/9 × echte Alt/Neu-Producer × fresh/stale:8 Pfade, je beide echten Browserdienste. Alter Validator verwirft als Negativkontrolle unprojizierte neue Annotationen; über neuen GET-Handler bleiben beide Leser gültig.',
  '34 aktuelle Produktfälle prüfen Resolverfehlbeleg, Typkonflikt, Remake, Mehrdeutigkeit, fehlendes Jahr und fehlende/veraltete Vorstellungen. Eigene HTTP-Probe prüft erneut relevante Karten-/Programmguards.',
  'Neuer Feed bleibt bytegleich während der Leseprojektion; jeweils50 Basiseinträge, ehrlicher Fallback, keine Provider-/Wikidata-/Schreibaufrufe beim Lesen; Dienstwahl und Füller durch34 Produktfälle erneut bestätigt.'
 ],
 'sources':[('supabase/functions/entdecken-daily-task/responseContract.js',92),('supabase/functions/entdecken-daily-task/index.ts',598),('src/services/entdeckenDailyFeed.js',279)]},
'KD-REV-E08-001':{
 'logs':p05,'rollout':'R-P05',
 'benefit':'Der neue Client versteht belegten Speicherteilerfolg weiterhin; auch der echte alte Client verwirft die Antwort nicht als unavailable und zeigt den gespeicherten Geschwisterfund.',
 'behaviorChange':'Neuer x-client-info-Wert erhält confirmed/partial mit persistence. Altclient erhält bewusst storage_error mit tatsächlichen writes und gespeichertem Feed; nicht darstellbare Teilspeicherwarnung wird nicht als Erfolg umgedeutet.',
 'riskAndComplexity':'Eine HTTP-Kompatibilitätsprojektion. Alte UI kann Teilerfolg nicht so genau erklären wie die neue; bestehender Fund bleibt über normalen Feed-Sync sichtbar. Scheduler, Receipt und Providerzahl unverändert.',
 'evidence':[
  'Aktueller Originalteilerfolgstest und echte Alt/Neu→PG17→Handler/Service-Kette: neuer Client confirmed,writes1,partial,ein gespeicherter Fund.',
  'Neuer Controller akzeptiert partial; alter Controller erhält ehrliches storage_error statt unavailable. Gemountete echte Alt/Neu-JSdom-Komponenten zeigen den gespeicherten Fund in vollständigem und teilfehlgeschlagenem Lauf.',
  'Originalteilerfolgstest erneut grün inklusive structured/providerpartial und elf Manipulationsfällen; Capability ändert keine Auth-/Receiptprüfung.',
  'Receipt bleibt unverändert, echte writes statt künstlicher0;15 synthetische Adapteraufrufe im lokalen PG-Gestell,0 Netz-/Provideraufrufe. Kein Produktretry ergänzt.',
  'Echter SQL-Pilotfeed liest erfolgreichen Geschwisterfund erneut. Beide gemounteten Clientgenerationen zeigen ihn; keine ungeprüften Modellkandidaten als gespeicherte UI-Daten.'
 ],
 'sources':[('supabase/functions/radar-websearch-task/contract.js',554),('supabase/functions/radar-websearch-task/index.ts',729),('src/services/radarWebsearch.js',225)]},
'KD-REV-E08-002':{
 'logs':p05,'rollout':'R-P05',
 'benefit':'Zwei Plattformstarts bleiben intern getrennt und sind zugleich in echten Alt/Neu-Lesern sichtbar; vorhandene UUIDs und Lebenszyklus bleiben erhalten.',
 'behaviorChange':'Interne Identität bleibt v2 mit Plattform. Nur SQL-/HTTP-Leseantwort trägt den originalen v1-Werkstarthash; Event-/Versions-UUIDs unterscheiden die zwei Plattformfunde. Additive0950 läuft vor1000.',
 'riskAndComplexity':'V1-Hash muss in JS/SQL übereinstimmen; aktueller Gegenvergleich mit echter14804ce-Funktion belegt es. Begrenzter pg_get_functiondef-Patch stoppt bei Definitiondrift; separate öffentliche Projektion vermeidet Rückbau interner v2-Identität.',
 'evidence':[
  'Vier echte Alt/Neu-Writer/Reader-Pfade mitPG17 erhalten2 EventUUIDs,2 VersionsUUIDs,2 Plattformen/Quellen und2 tatsächliche UI-Karten.',
  'Umgekehrte Kandidatenreihenfolge behält fachliche Identität; echte SQL-Endstände und Feed verglichen.',
  'Identischer Replay liefert no_change,writes0 und unveränderte UUIDs/Versionen.0950-Replay ändert Definition/Rows nicht erneut.',
  'Echter V1-Bestand vor0950; nach0950/1000/1010 bleiben Event-/VersionsUUIDs und Metadaten. Beide Leser akzeptieren nach jedem Schritt. JS/SQL-Wirehash stimmt gegen echte14804ce-Hashfunktion überein.',
  'Echte Alt/Neu-Queue+RPC+Reload für Pause/Resume/Entfernen; strukturierter Review/Import/Receipt und Operationreplay erhalten. Anonfeed und authenticated direkter Hashhelper bleiben verboten; keine Providerwirkung.'
 ],
 'sources':[('supabase/functions/radar-websearch-task/contract.js',541),('supabase/migrations/20260917095000_review_radar_client_compat.sql',6),('supabase/migrations/20260917095000_review_radar_client_compat.sql',31)]},
'KD-REV-E10-004':{
 'logs':p06,'rollout':'R-P06',
 'benefit':'Film/Serie mit gleicher TMDB-Nummer bleiben sicher getrennt; mehrdeutige alte PWA-Anfragen können weder falschen Filmbericht lesen noch ungewollt Recherche starten.',
 'behaviorChange':'Alte Numeric-read-RPCs enden nach Auth/Accountguard als gesperrt; Numeric-Synthese endet als nicht_zuordenbar vor Vorbereitung/Quellen/Kosten. Nur Forecast mit explizitem film.typ wird typisiert. Enger alter-SQL-Fehler wird als fehlender Cache behandelt.',
 'riskAndComplexity':'Bewusster Funktionsverlust für alte TMDB-only-Filmwissen-PWA bis Clientupdate, auch für Filme. Keine vollständige Rückwärtskompatibilität. Kleiner Guard in atomarer noch nicht angewandter1100; Function→SQL→neuerClient nötig. Andere SQLfehler bleiben sichtbar.',
 'evidence':[
  'Identitäts-/In-flight-Code bleibt bytegleich zur Erstprüfung.32 aktuelle SQL-/echte Altclientfälle trennen movie:348/tv:348; alter Baselinevertrag reproduziert zunächst identische Film-/Serienrequests und falschen Filmbericht.',
  'Echter alter Service mit neuer SQL endet für Film/Serie und nach IMDb-cache_miss als gesperrt,0 Recherchen. Neuer Service liest passenden typisierten Bericht; alte Numeric-Synthese stoppt vor Nebenwirkung.',
  '47 Functionfälle gegen echte alte/neue Handler belegen neue typed-TV-Grenze und terminale Numeric-Synthese; unveränderte Quellenadapter behalten Film-only-Vertrag.',
  'Forecast adaptiert Numeric nur bei explizit film/serie. Falscher Cachetyp erzeugt keine Filmwissenprovenienz. Nur22023/kennung_ungueltig bei TMDB wird Cachemiss; andere22023,42501,XX000 undIMDb bleiben500.',
  'Gültige IMDb- und neue typed-Film-TMDB-Reads bleiben grün. Die alte TMDB-only-PWA verliert absichtlich Filmwissen bis Update, weil ihr Film-/Serienrequest identisch ist; kein stilles Raten.',
  '32 Rollout-SQLfälle plus19 bestehende SQLgrenzen: Filmkennungen migriert, Serienaltzuordnung quarantänisiert, Numeric-read terminal, normalizer/write streng, Auth/RLS unverändert,3 Werke/3 Versionen/0 Jobs durch Reads unverändert.'
 ],
 'sources':[('supabase/functions/ai-task/index.ts',790),('supabase/functions/ai-task/index.ts',2254),('supabase/functions/ai-task/index.ts',4544),('supabase/functions/ai-task/index.ts',4628),('supabase/migrations/20260917110000_review_filmwissen_identity.sql',257)]}
}
for issue in issues:
 if issue['id'] not in updates:continue
 u=updates[issue['id']]
 for k in ['benefit','behaviorChange','riskAndComplexity']:issue[k]=u[k]
 issue['decisionReason']='BEHALTEN: gezielte Übergangsänderung schließt den bestätigten lokalen Mischbetriebsrest unter den ausdrücklich benannten Vertragsgrenzen; keine breitere Abstraktion erforderlich.'
 issue['rolloutFinding']=u['rollout']; issue['deltaTests']=u['logs']
 assert len(issue['criteria']) == len(u['evidence'])
 for c,e in zip(issue['criteria'],u['evidence']):
  c['evidence']=e; c['testLogs']=u['logs']; c['provenance']='Aktueller Deltabefund; soweit ausdrücklich genannt fortgeschriebener unveränderter eigener Erstbefund.'
 for f,line in u['sources']:
  issue['sourceLocations'].append({'file':f,'line':line,'excerpt':(R/f).read_text().splitlines()[line-1].strip()})

def rollout(id,scope,status,decision,evidence,limits,order):return dict(id=id,issues=scope,localStatus=status,decision=decision,evidence=evidence,remainingLimits=limits,requiredDeliveryOrder=order,remoteStatus='NICHT DURCH DIESEN AUDIT AUSGEFUEHRT ODER BELEGT')
rollouts=[
 rollout('R-P05',['KD-REV-E08-001','KD-REV-E08-002'],'LOKAL GESCHLOSSEN','BEHALTEN',p05,
 ['Alte UI kann partial nicht ausdrücken; ehrliches storage_error bewahrt writes/Feed.','Gemeinsames Backend und Alt-PWA erfordern tatsächlichen Rolloutreadback. Öffentlicher v1-Werkstarthash darf EventUUIDs nicht ersetzen.'],
 '0950 vor1000 (danach1010); neue Radarfunction vor neuem Client. Gesamtes SQLpaket in normaler Reihenfolge, keinev2-Migration ohne0950.'),
 rollout('R-P06',['KD-REV-E10-004'],'LOKAL GESCHLOSSEN MIT BEWUSSTER ALTCLIENT-GRENZE','BEHALTEN',p06,
 ['Keine vollständige Rückwärtskompatibilität: alte TMDB-only-PWA bleibt gesperrt bis Update, weil Film undSerie denselben Request senden.','Zwischen neuer Function und neuer SQL bleibt direkter Altclientread gegen alte SQL der alte fehlerhafte Vertrag; Sicherheitsabschluss erst nach SQL.','Neuer Client gegen alte Function ist nicht unterstützt; kein ungeprüfter Funktionsrollback.','1100 darf nur vor erstmaliger Remoteanwendung geändert werden; Master meldet frisch keine Migration>=0950.'],
 'Neue ai-task-Function → neue1100-SQL → neuer Client; typisierter Forecast toleriert allein den exakt bekannten alten TMDB-SQL-Vertrag ohne Filmwissenprovenienz.'),
 rollout('R-P08',['KD-REV-E07-002'],'LOKAL GESCHLOSSEN','BEHALTEN',p08,
 ['Alte Leser erhalten50 Basiseinträge ohne neue ÖFI-Annotation; neue Leser erhalten Annotation nur bei exaktem Accept-Opt-in.','Keine eigene neue Browser-/CORS-Sitzung in dieser Delta-Prüfung; Master besitzt Browsergesamtlauf. Eigene Probe verwendet echten Handler und echte Browserdienste unterNode.','Bestehende1300-SQL-Migration bleibt erforderlich; keine zusätzliche P08-Migration.'],
 'Kompatibler vollständiger neuer Entdecken-Handler (Producer und GET-Projektion gemeinsam) plus benötigte1300-Persistenz bevor neuer Feed gespeichert wird; danach neuer Client. Alte Producer/Feeds bleiben lesbar.')
]
logs=[]
for name in sorted(set(p05+p06+p08)):
 logs.append({'path':name,'sha256':sha((O/name).read_bytes()),'result':'PASS'})
report={
 'schema':'kinodreieck-independent-benefit-delta-v1','candidateCommit':NEW,'previousCandidateCommit':OLD,'baselineCommit':BASE,'worktree':str(R),'auditor':'Eigenständiger Astra/xhigh-Prüfer, kein Baumeister und keine Unterprüfer','completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'counts':{'tickets':49,'criteria':239,'targetedDeltaIssues':4,'carriedForwardIssues':45,'ERLEDIGT':49,'OFFEN':0,'NICHT BELEGT':0,'localRolloutRemaindersClosed':3,'remoteRolloutsProven':0},
 'decision':'Alle49 lokalen Fixentscheidungen BEHALTEN. Drei bestätigte Mischbetriebsreste lokal geschlossen, P06 ausdrücklich mit temporär gesperrter alter TMDB-only-PWA. Keine Remote-/Releasefreigabe.',
 'methodology':['Nur9 geänderte Produktdateien, betroffene4 Tickets und unmittelbare P05/P06/P08-Verträge geprüft; kein neuer Vollreview.','Alle49 Ticketbytes perSHA256 gegen Erstprüfung identisch. Nicht erneut geprüfte45 Urteile anhand vollständiger Dateibytes bzw unveränderter41-Zeilen-Quellenumgebung in geänderter ai-task-Datei fortgeschrieben. E10-001/E10-002 erhalten nur Zeilenverschiebung außerhalb ihrer Fixblöcke.','Eigene7 gezielte Testbefehle; tatsächliche14804ce- und9d88-Module, lokale PG17.10 und synthetische Konto-/Providerdoubles. Kein Remote/Provider/Browser/Port5173/Build/Vollsuite.','P08-eigene Probe verwendet ursprünglichen und neuen Producer und echte Handler/Services; keine SQL-Persistenz neu ausgeführt. Unveränderte SQL aus eigener frühererPGprüfung fortgeschrieben; Owner-PG/Browsertest vollständig gelesen, nicht als eigenen Lauf ausgegeben.','Initialer eigener P08-RPC-Double ließ maxAttempts weg: Runnerdefault3 wurde vom echten Format8/9-Leser korrekt verworfen. Nach Ergänzung des realen maxAttempts:1-Vertrags grün; ursprüngliches Fehlerlog erhalten. Keine Produktassertion gelockert.','Original-SQLtest hat ausschließlich Numeric-read-Erwartung an neuen terminalen Vertrag angepasst;19 übrige/inklusiveGrenzfälle laufen, kein Skip. Deno349 gefilterte Fälle sind explizit außerhalb der begrenzten47-Fälle-Deltaprüfung, kein behaupteter Vollsuitenlauf.'],
 'issues':issues,'rolloutDecisions':rollouts,
 'immediateDependencies':[{'issues':['KD-REV-E05-002','KD-REV-E08-004','KD-REV-E08-005','KD-REV-E14-001'],'verdict':'Unveränderte lokale Fixblöcke; P05-Wireprojektion mit echten Alt/Neu-Pilotfeed-/Controller-/Lebenszyklus-/Receiptwegen lokal durchlaufen. Keine direkte Übernahme von Modelltext.'},{'issues':['KD-REV-E07-001'],'verdict':'Unveränderte Source-dedupe/Typ-Kollision-Grenzen;34 aktuelle Producer-/UI-Fälle bleiben grün.'},{'issues':['KD-REV-E10-001','KD-REV-E10-002','KD-REV-E10-003'],'verdict':'HTTP-Eingangs-, Diagnostik- und Quellenadapterfixes unverändert. Neuer Numeric-Guard sitzt nach bestehenden Zugriffsgates und vor Synthese; gezielte Auth/Fehlergrenzen aktuell belegt.'}],
 'smallerSharedCorrection':{'decision':'Kein weiteres Refactoring empfehlen.','reason':'Die drei Korrekturen liegen bereits an tatsächlichen gemeinsamen Lesegrenzen: Radar SQLfeed+HTTP, Entdecken GET-Projektion, Filmwissen RPC/Function. Eine gemeinsame generische Versions-/Identitätsschicht würde unterschiedliche Semantik koppeln (UUID/Plattform, optionales Annotationformat, unauflösbare Numericidentität) und keinen weiteren lokalen Sonderfall sicher beseitigen. Vorige Ursachen-/Knotenbewertung bleibt ansonsten unverändert.','costs':['Radar benötigt gleicheV1hash-Semantik inSQL/JS; echterAltquellen-Gegenvergleich vorhanden.','Entdecken benötigt ein exaktes Accept-Token; unbekannte Werte fallen auf sicheren Basispool.','Filmwissen benötigt einen terminalen Altreadguard und ausdrücklich typisierten Forecastadapter; Weglassen würde belegte Fehlzuordnung oder400/500 erneut einführen.']},
 'remoteContext':{'source':'Nur Mitteilung des Masters, kein eigener Remotecheck','observedByMaster':'Beide Refs/Webbuilds14804ce; Ledger87,max20260916193000; keineMigration>=0950. SharedSupabaseprojekt bleibt bestehen.','implication':'Noch nicht ausgeliefert. Frische Auslieferungsbelege bleiben eigener Auftrag.'},
 'limits':['Physisches iPhone/PWA, reale Alt-PWA mit dauerhaftem Cache und tatsächliche Remote-RLS/Datensätze nicht neu geprüft.','E13-F005 bleibt separat ungeklärt und ist nicht Teil der49.','Keine Behauptung nur Vorteile oder vollständiger Rückwärtskompatibilität.','Keine Produktdatei, SQLdatei oder bestehender Bericht vom Prüfer geändert; nur detachedCheckout und eigenesBelegverzeichnis.'],
 'testEvidence':logs,'sourceManifest':'source-delta.json','sourceCarryForward':'source-carryforward.json','priorAudit':'prior-audit/REVIEW.json','workingTreeClean':True
}
dump('source-delta.json',source_manifest);dump('source-carryforward.json',carry);dump('DELTA_REVIEW.json',report)
lines=[f'# Unabhängige Deltakontrolle der49 Fixentscheidungen\n',f'**Kandidat:** `{NEW}` · Vorprüfung `{OLD}` · Originalstand `{BASE}`.\n',
 '**Urteil: alle49 lokalen Fixes weiterhin ERLEDIGT / BEHALTEN.** Die drei bestätigten Mischbetriebsreste sind lokal behoben. Filmwissen bleibt bewusst eingeschränkt: Alte TMDB-only-PWAs werden bis zum Clientupdate gesperrt. Kein weiterer bestätigter Produktrestfehler in diesem Delta; keine Auslieferungsfreigabe.\n',
 'Vier betroffene Tickets wurden gezielt nachgeprüft;45 Urteile wurden anhand unveränderter Ticketbytes und Quellen fortgeschrieben. Die vollständigen239 Einzelkriterien einschließlich aktueller Fundstellen, Nutzen, Verhaltensänderungen und Kosten stehen in [DELTA_REVIEW.json](DELTA_REVIEW.json). [Quellenfortschreibung](source-carryforward.json) enthält jeTicket die SHA256- und Zeilenbelege. Die ursprüngliche unabhängige Entscheidung ist unter [prior-audit/REVIEW.json](prior-audit/REVIEW.json) erhalten.\n',
 '## Drei Rolloutentscheidungen\n',
 '|Rest|Lokales Urteil|Erhaltener Vertrag und Grenze|\n|---|---|---|',
 '|R-P05 Radar|BEHALTEN, geschlossen|Internev2-Plattformidentität; echterv1-Werkstarthash im SQL-/HTTPfeed. Event-/VersionsUUIDs erhalten2Plattformen. Alte Partial-UI bekommt ehrliches storage_error mit tatsächlichen writes/Feed.0950 vor1000; neueFunction vorClient.|',
 '|R-P06 Filmwissen|BEHALTEN, geschlossen mit Altclientgrenze|Numeric-read terminalgesperrt, Numeric-Synthese nicht_zuordenbar. Typisierung nur mit explizitem film.typ. **Keine vollständige Rückwärtskompatibilität. Function→SQL→neuerClient.** AndereSQLfehler bleiben sichtbar.|',
 '|R-P08 Entdecken|BEHALTEN, geschlossen|GET-Projektion erhält50Basiseinträge fürAltleser; exaktesAccept erhält zusätzlichÖFI. Producer/Persistenz unverändert. Vollständige neueFunction und erforderliche1300 vor neuemFeed; kein zusätzlicherSQLpatch.|\n',
 '## Gezielte Einzelnachprüfung\n']
for issue in issues:
 if issue['id'] not in principal:continue
 lines += [f"### {issue['id']} — {issue['title']}\n",f"**{issue['status']} / {issue['decision']}.** {issue['benefit']}\n",issue['behaviorChange']+' '+issue['riskAndComplexity']+'\n']
 for c in issue['criteria']: lines.append(f"- K{c['number']}: {c['evidence']}")
 lines.append('\nFundstellen: '+', '.join(f"`{s['file']}:{s['line']}`" for s in issue['sourceLocations'][-len(updates[issue['id']]['sources']):])+'.\n')
lines += ['## Aktuelle Prüfbelege und Grenzen\n',
 '- Radar: echter14804ce/9d88-Code → lokalesPG17.10 → Handler/Service → gemounteteJSdom-UI;2Plattformen, UUID-Erhalt, Reihenfolge, Replay, Partial, Lebenszyklus und strukturierterReceipt. [Log](review49_rollout_p05_pg17_test.log), [ursprüngliche Partialgrenzen](review49_p05_partial_test.log).',
 '- Filmwissen:47 echte Alt/Neu-Functionfälle,32PG-/Altclientfälle sowie19 bestehendeSQL-Grenzen. [Function](review49_rollout_p06_function_test.log), [RolloutSQL](review49_rollout_p06_sql_test.log), [SQLregression](review49_p06_sql_test.log).',
 '- Entdecken: eigene8Pfadmatrix (beideFormate × beideProducer × fresh/stale, jeweils beide echtenServices) mit Auth-/Read-/Fallbackgrenzen und unverändertemFeed; zusätzlich34Produktfälle. [Matrix](probe-p08-read-matrix.json), [Log](probe-p08-read-matrix.log), [Produktfälle](review49_p08_entdecken_test.log).',
 '- Der erste eigeneP08-Double enthielt kein maxAttempts:1; Format8/9 wurde korrekt alsinvalid_response verworfen. Fixture korrigiert, Assertions unverändert, [erster Fehler](probe-p08-read-matrix.initial-fixture-failure.log) erhalten. Das ist kein Produktrestfehler.',
 '- Kein neuer Browserlauf, keinPort5173, keine volleSuite, keinBuild und keinRemote/Provider durch diesenPrüfer. P08SQL ist unverändert und durch eigeneVorprüfung belegt; den neuen OwnerPG-/Browsertest habe ich gelesen, nicht selbst ausgeführt. Master führt den vollständigen Abschluss separat durch.\n',
 '## Verbleibende Auslieferungsgrenzen\n',
 'Master meldet frisch beideRemote-Refs/Webbuilds14804ce sowie Ledger87,max20260916193000, ohneMigration>=0950; diese Information ist ausdrücklich kein eigenerRemotecheck.0950 ist additiv;1100 ist noch nie angewandt und enthält den Numericguard atomar. Falls der Ledger vor Lieferung abweicht, muss der Migrationsplan neu abgeglichen werden.\n',
 'Die neueFilmwissen-Function allein repariert keinen direktenAltclientread gegen alteSQL. Erst dasSQLupdate schließt diesen Datenlesefehler; danach darf der neueClient folgen. AlteTMDB-only-Filmwissenwege bleiben gesperrt, auch beiFilmen. IMDb und explizit typisierte neueWege bleiben funktionsfähig. PhysischePWA-/iPhoneabnahme und Remote-Readbacks stehen separat aus.\n',
 '## Gemeinsame Knoten und kleinere Alternativen\n',report['smallerSharedCorrection']['reason']+' '+ ' '.join(report['smallerSharedCorrection']['costs'])+'\n',
 'UnmittelbareNachbarn: E05-002/E08-004/E08-005/E14-001 behalten Radar-Pilotfeed,Queue,Receipt-/UI-Verträge; E07-001 behält Typ-/Sourceguards; E10-001/E10-002/E10-003 behalten Eingang,Diagnostik und Quellenadapter. Ihre Fixblöcke sind unverändert. E10-001/E10-002 liegen in der insgesamt geändertenai-task-Datei; ihre unveränderten Quellenumgebungen sind separat nachgewiesen.\n',
 '## Alle49 endgültigen lokalen Status\n',
 '|Ticket|Status|Urteil|Aktuelle Grundlage|\n|---|---|---|---|']
for i in issues:lines.append(f"|{i['id']}|{i['status']}|{i['decision']}|{'Gezieltes Delta' if i['id'] in principal else 'Quellengeprüfte Fortschreibung'}|")
lines += ['\nE13-F005 ist weiterhin separat ungeklärt und nicht Teil dieser49. Alle239 Kriterien sind imJSON eindeutig zugeordnet. Arbeitsbaum am genanntenKandidaten sauber; Produktbytes unverändert.\n']
(O/'DELTA_REVIEW.md').write_text('\n'.join(lines))
validation={'commit':NEW,'ticketCount':len(issues),'uniqueTickets':len({i['id'] for i in issues}),'criteria':sum(len(i['criteria']) for i in issues),'targeted':sum(i['deltaMode']=='TARGETED_DELTA' for i in issues),'carried':sum(i['deltaMode']=='CARRIED_FORWARD' for i in issues),'allTicketsOriginalBytes':all(c['originalTicketUnchanged'] for c in carry),'rolloutCount':len(rollouts),'worktreeClean':git('status','--porcelain=v1')==b''}
assert validation['ticketCount']==validation['uniqueTickets']==49 and validation['criteria']==239 and validation['targeted']==4 and validation['carried']==45 and validation['worktreeClean']
dump('report-validation.json',validation)
manifest={str(p.relative_to(O)):sha(p.read_bytes()) for p in sorted(O.rglob('*')) if p.is_file() and p.name!='ARTIFACT_SHA256.json'}
dump('ARTIFACT_SHA256.json',manifest)
print(json.dumps(validation,ensure_ascii=False));print('Artifacts:',len(manifest))
