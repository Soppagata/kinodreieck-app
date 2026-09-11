import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createEntdeckenDailyResponse } from "./supabase/functions/entdecken-daily-task/responseContract.js";

const index = readFileSync("supabase/functions/entdecken-daily-task/index.ts", "utf8");
const workflow = readFileSync(".github/workflows/entdecken-six-day.yml", "utf8");
const adapter = readFileSync("supabase/functions/entdecken-daily-task/flixpatrolMixAdapter.js", "utf8");
const tab = readFileSync("src/tabs/EntdeckenTab.jsx", "utf8");
assert.match(index, /createFlixPatrolMixAdapter/);
assert.match(index, /kd_flixpatrol_usage_begin/);
assert.match(index, /kd_flixpatrol_usage_finish/);
assert.match(index, /kd_flixpatrol_chart_read/);
assert.match(index, /kd_flixpatrol_titles_read/);
assert.match(index, /kd_flixpatrol_vocabulary_read/);
assert.match(index, /FLIXPATROL_TITLE_BATCH_MODE/);
assert.match(index, /ENTDECKEN_FLIXPATROL_NETFLIX_MODE/);
assert.match(index, /ENTDECKEN_FEED_CONSUMERS/);
assert.match(index, /const format9Enabled = titleBatchEnabled/);
assert.match(index, /netflixDaily: format9Enabled/);
assert.doesNotMatch(index, /\.fetchQuota\s*\(/);
assert.equal((adapter.match(/chartType: "(?:movies|tvshows)"/g) || []).length, 7);
assert.match(adapter, /ENTDECKEN_FLIXPATROL_MAX_CHART_REQUESTS = 5/);
assert.match(adapter, /ENTDECKEN_FLIXPATROL_DAILY_MAX_CHART_REQUESTS = 7/);
assert.match(adapter, /ENTDECKEN_FLIXPATROL_DAILY_MAX_TITLE_REQUESTS = 4/);
assert.match(workflow, /cron: "0 2 \* \* \*"/);
assert.match(workflow, /flixpatrolChartRequests[^\n]+<= 5/);
assert.match(workflow, /flixpatrolTitleRequests[^\n]+<= 25/);
assert.match(workflow, /sourceRequests[^\n]+<= 32/);
assert.match(workflow, /service === "Apple TV"/);
assert.doesNotMatch(workflow, /service === "Apple TV\+"/);
assert.match(tab, /entry\.popularity\?\.measuredOn \|\| source\(entry\)\?\.retrievedOn/);
assert.match(tab, /`Stand: \$\{formatPresentationDate\(webDiscoveryFeed\.refreshedOn\)\}`/);
assert.doesNotMatch(tab, /Titel deiner ausgewählten Streamingdienste|Popularitätsaussage/);
assert.equal(31 * (5 + 25) + 31, 961);

const response = createEntdeckenDailyResponse({
  status: "fresh", feed: null, writes: 1, responseMode: "structured", displayText: null, warnings: [],
  refresh: { requested: true, mode: "scheduled", status: "refreshed", attemptCount: 1, maxAttempts: 1 },
}, {
  providerRequests: 0, searchRequests: 0, publicSourceRequests: 2,
  flixpatrolChartRequests: 5, flixpatrolTitleRequests: 25, flixpatrolRequests: 30,
  sourceRequests: 32, wikidataRequests: 0,
});
assert.deepEqual({
  providerRequests: response.providerRequests,
  publicSourceRequests: response.publicSourceRequests,
  flixpatrolChartRequests: response.flixpatrolChartRequests,
  flixpatrolTitleRequests: response.flixpatrolTitleRequests,
  flixpatrolRequests: response.flixpatrolRequests,
  sourceRequests: response.sourceRequests,
}, {
  providerRequests: 0, publicSourceRequests: 2, flixpatrolChartRequests: 5,
  flixpatrolTitleRequests: 25, flixpatrolRequests: 30, sourceRequests: 32,
});

console.log("Entdecken FlixPatrol function/workflow: 19 checks passed");
