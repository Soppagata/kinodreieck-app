import assert from "node:assert/strict";
import { test } from "node:test";
import { runMotnSync } from "./supabase/functions/streaming-motn/runner.js";

const checkpoint = {from:1000000000,to:1000000100,cursor:"saved-cursor",done:false};
test("A resumed sync continues at the stored cursor and commits before fetching the next page",async()=>{
  const events=[];
  const rpc=async(name,args)=>{
    events.push([name,args]);
    if(name==="kd_motn_claim")return {claimed:true,checkpoints:{new:checkpoint}};
    if(name==="kd_motn_reserve")return {reserved:true};
    return {ok:true};
  };
  const fetched=[];
  const result=await runMotnSync({apiKey:"fixture-key",rpc,randomUUID:()=>"fixture-run",fetchImpl:async(url)=>{
    events.push(["fetch"]);fetched.push(new URL(url).searchParams.get("cursor"));
    return Response.json({changes:[],shows:{},hasMore:fetched.length===1,nextCursor:"next-page"});
  }});
  assert.deepEqual(fetched,["saved-cursor","next-page"]);
  assert.equal(result.providerRequests,2);
  const order=events.map(([name])=>name);
  assert.ok(order.indexOf("kd_motn_commit_page")<order.lastIndexOf("fetch"));
});

test("A failed page is not committed or retried, while earlier progress remains committed",async()=>{
  let calls=0;const commits=[];
  const rpc=async(name,args)=>{
    if(name==="kd_motn_claim")return {claimed:true,checkpoints:{new:checkpoint}};
    if(name==="kd_motn_reserve")return {reserved:true};
    if(name==="kd_motn_commit_page")commits.push(args);
    return {ok:true};
  };
  const result=await runMotnSync({apiKey:"fixture-key",rpc,randomUUID:()=>"fixture-run",fetchImpl:async()=>{
    calls++;return calls===1?Response.json({changes:[],shows:{},hasMore:true,nextCursor:"saved-next"}):new Response("error",{status:429});
  }});
  assert.equal(calls,2);assert.equal(commits.length,1);assert.equal(commits[0].p_next_cursor,"saved-next");
  assert.equal(result.ok,false);assert.equal(result.code,"MOTN_HTTP_ERROR");
});

test("A quota reservation failure stops before the provider request",async()=>{
  let calls=0;
  const result=await runMotnSync({apiKey:"fixture-key",randomUUID:()=>"fixture-run",
    rpc:async(name)=>name==="kd_motn_claim"?{claimed:true,checkpoints:{new:checkpoint}}:{reserved:false,ok:true,status:"quota_limit"},
    fetchImpl:async()=>{calls++;},
  });
  assert.equal(result.status,"limited");assert.equal(result.providerRequests,0);assert.equal(calls,0);
});

test("Busy/not-due runs do not call MotN",async()=>{
  const result=await runMotnSync({apiKey:"fixture-key",randomUUID:()=>"fixture-run",
    rpc:async()=>({ok:true,claimed:false,status:"not_due"}),fetchImpl:async()=>{throw new Error("must not fetch");}});
  assert.equal(result.status,"not_due");assert.equal(result.providerRequests,0);
});
