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

for (const status of ["unchanged", "cooldown"]) test(`Daily ${status} checks use two requests without importing or retrying`,async()=>{
  const events=[];
  const result=await runMotnSync({apiKey:"fixture-key",randomUUID:()=>"fixture-run",
    rpc:async(name,args)=>{
      events.push([name,args]);
      if(name==="kd_motn_claim")return {claimed:true,mode:"probe",checkpoints:{new:{...checkpoint,cursor:null},removed:{...checkpoint,cursor:null}}};
      if(name==="kd_motn_reserve")return {reserved:true};
      if(name==="kd_motn_probe_result")return {ok:true,status};
      return {ok:true};
    },fetchImpl:async()=>Response.json({changes:[],shows:{},hasMore:status==="cooldown",nextCursor:"more"}),
  });
  assert.equal(result.status,status);assert.equal(result.providerRequests,2);
  assert.equal(events.find(([name])=>name==="kd_motn_probe_result")[1].p_has_changes,status==="cooldown");
  assert.equal(events.some(([name])=>name==="kd_motn_commit_page"),false);
});

test("An allowed changed window reuses both check pages and fetches only subsequent pages",async()=>{
  const fetched=[],commits=[];
  const result=await runMotnSync({apiKey:"fixture-key",randomUUID:()=>"fixture-run",
    rpc:async(name,args)=>{
      if(name==="kd_motn_claim")return {claimed:true,mode:"probe",checkpoints:{new:{...checkpoint,cursor:null},removed:{...checkpoint,cursor:null}}};
      if(name==="kd_motn_reserve")return {reserved:true};
      if(name==="kd_motn_probe_result")return {ok:true,status:"sync"};
      if(name==="kd_motn_commit_page")commits.push([args.p_kind,args.p_cursor]);
      return {ok:true};
    },fetchImpl:async(url)=>{
      const q=new URL(url).searchParams;
      fetched.push([q.get("change_type"),q.get("cursor")]);
      return Response.json({changes:[],shows:{},hasMore:fetched.length===1,nextCursor:"remaining-new"});
    },
  });
  assert.equal(result.status,"succeeded");assert.equal(result.providerRequests,3);
  assert.deepEqual(fetched,[["new",null],["removed",null],["new","remaining-new"]]);
  assert.deepEqual(commits,[["new",null],["new","remaining-new"],["removed",null]]);
});

test("A failed second check cannot acknowledge an empty window or start an import",async()=>{
  const events=[];let calls=0;
  const result=await runMotnSync({apiKey:"fixture-key",randomUUID:()=>"fixture-run",
    rpc:async(name)=>{
      events.push(name);
      if(name==="kd_motn_claim")return {claimed:true,mode:"probe",checkpoints:{new:{...checkpoint,cursor:null},removed:{...checkpoint,cursor:null}}};
      return {ok:true,reserved:true};
    },fetchImpl:async()=>++calls===1?Response.json({changes:[],shows:{},hasMore:false}):new Response("unavailable",{status:503}),
  });
  assert.equal(result.ok,false);assert.equal(result.providerRequests,2);
  assert.equal(events.includes("kd_motn_probe_result"),false);assert.equal(events.includes("kd_motn_commit_page"),false);
});

test("A partial import resumes only the unfinished kind and finishes its existing run",async()=>{
  const fetched=[];
  const result=await runMotnSync({apiKey:"fixture-key",randomUUID:()=>"fixture-run",
    rpc:async(name)=>name==="kd_motn_claim"?{claimed:true,mode:"sync",checkpoints:{new:{...checkpoint,done:true},removed:checkpoint}}:{ok:true,reserved:true},
    fetchImpl:async(url)=>{fetched.push(new URL(url).searchParams.get("change_type"));return Response.json({changes:[],shows:{},hasMore:false});},
  });
  assert.equal(result.status,"succeeded");assert.deepEqual(fetched,["removed"]);assert.equal(result.providerRequests,1);
});
