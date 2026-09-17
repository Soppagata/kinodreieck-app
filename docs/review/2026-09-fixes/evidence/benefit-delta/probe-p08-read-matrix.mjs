import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createReaderMatrix} from '/private/tmp/kd-review49-benefit-audit-20260917/tests/fixtures/review49_rollout_p08_readers.mjs';
import {createProducer,isoWeek} from '/private/tmp/kd-review49-benefit-audit-20260917/tests/fixtures/review49_p08_feed.mjs';
// An independent HTTP/service boundary probe. No local browser/server is opened.
// SQL persistence is unchanged in P08 and is covered by the existing prior PG evidence.
const matrix=await createReaderMatrix();
const results=[];
const today='2026-09-17';
try {
  for(const format of [8,9]) for(const writer of ['old','new']) {
    const producer=(writer==='old'?matrix.oldProducer:createProducer)({format,today});
    const produced=await producer.run();
    assert.equal(produced.status,'fresh');
    const feed=produced.feed, before=JSON.stringify(feed);
    for(const day of [today,'2026-09-18']) {
      const states=await matrix.verify({feed,today:day,writer,
        readStatus:()=>({feedEnabled:true,today:day,isoWeek:isoWeek(day),refresh:false,attemptCount:1,maxAttempts:1,feed})});
      assert.equal(JSON.stringify(feed),before,'HTTP projection does not mutate stored producer result');
      results.push({format,writer,day,oldStatus:states.old.status,newStatus:states.new.status,
        oldItems:states.old.feed.items.length,newItems:states.new.feed.items.length,
        oldAnnotations:states.old.feed.annotations?.length||0,newAnnotations:states.new.feed.annotations?.length||0});
    }
  }
  writeFileSync('/private/tmp/kd-review49-benefit-delta-20260917/probe-p08-read-matrix.json',JSON.stringify(results,null,2)+'\n');
  console.log('PASS: 8 producer/HTTP/old+new service paths, exact Accept fallback, source guards, account gates, no read mutation; no browser/server started');
} finally {matrix.close();}
