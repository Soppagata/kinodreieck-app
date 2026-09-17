import fs from 'node:fs';
import assert from 'node:assert/strict';
import {validateWebDiscoveryFeed as oldValidator} from './baseline-webDiscoveryFeed.mjs';
import {validateWebDiscoveryFeed as newValidator} from '/private/tmp/kd-review49-benefit-audit-20260917/src/lib/webDiscoveryFeed.js';
import {createProducer} from '/private/tmp/kd-review49-benefit-audit-20260917/tests/fixtures/review49_p08_feed.mjs';
globalThis.fetch=async()=>{throw Error('External network forbidden');};
const rows=[];
for(const format of [8,9]) {
 const {feed}=await createProducer({format}).run();
 const bare=structuredClone(feed); delete bare.annotations;
 const r={format,annotations:feed.annotations.length,items:feed.items.length,newReader:newValidator(feed),oldReader:oldValidator(feed),oldReaderWithoutAnnotations:oldValidator(bare)};
 assert.equal(r.newReader.ok,true);assert.equal(r.oldReader.ok,false);assert.equal(r.oldReaderWithoutAnnotations.ok,true);
 rows.push({format,annotations:r.annotations,items:r.items,newReader:r.newReader.ok,oldReader:r.oldReader.ok,oldErrors:r.oldReader.errors,oldReaderWithoutAnnotations:true});
}
fs.writeFileSync(new URL('./repro-oefi-compat.json',import.meta.url),JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows,null,2));
