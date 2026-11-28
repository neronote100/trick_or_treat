import test from "node:test";
import assert from "node:assert/strict";
import worker, {dispatchIfDue} from "./worker.mjs";
const env = {GITHUB_ACTIONS_TOKEN: "mock"};
const now = Date.parse("2026-11-28T02:00:00Z");
function fake(runs, status = 204) {
  const calls = [];
  const request = async (url, options) => {
    calls.push({url, options});
    if (calls.length === 1) return Response.json({workflow_runs: runs});
    return new Response(null, {status});
  };
  return {calls, request};
}
test("dispatches only main when previous success is stale", async () => {
  const f = fake([{status:"completed",conclusion:"success",updated_at:"2026-11-28T00:00:00Z"}]);
  assert.equal(await dispatchIfDue(env, f.request, now), "dispatched");
  assert.equal(f.calls.length, 2);
  assert.deepEqual(JSON.parse(f.calls[1].options.body), {ref:"main"});
  assert.match(f.calls[1].url, /christmas-tree-sync\.yml\/dispatches$/);
});
test("skips recent successful runs and active runs", async () => {
  for (const run of [
    {status:"completed",conclusion:"success",updated_at:"2026-11-28T01:45:00Z"},
    {status:"in_progress"}
  ]) {
    const f = fake([run]);
    assert.match(await dispatchIfDue(env, f.request, now), /^skipped/);
    assert.equal(f.calls.length,1);
  }
});
test("retries a failed run and surfaces dispatch failure", async () => {
  const f = fake([{status:"completed",conclusion:"failure",updated_at:"2026-11-28T01:59:00Z"}],403);
  await assert.rejects(dispatchIfDue(env,f.request,now),/HTTP 403/);
});
test("fails closed without credentials or when lookup fails", async () => {
  await assert.rejects(dispatchIfDue({},()=>{throw Error("unexpected")},now),/Missing/);
  await assert.rejects(dispatchIfDue(env,async()=>new Response(null,{status:401}),now),/HTTP 401/);
  assert.equal(worker.fetch().status,404);
});
