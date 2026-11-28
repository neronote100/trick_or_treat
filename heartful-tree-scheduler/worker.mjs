// Free-tier scheduler: no public HTTP trigger and no note data processing.
const endpoint = "https://api.github.com/repos/neronote100/trick_or_treat/actions/workflows/christmas-tree-sync.yml";
const recentMs = 25 * 60 * 1000;

export async function dispatchIfDue(env, request = fetch, now = Date.now()) {
  if (!env.GITHUB_ACTIONS_TOKEN) throw new Error("Missing GITHUB_ACTIONS_TOKEN secret");
  const headers = {
    "Authorization": "Bearer " + env.GITHUB_ACTIONS_TOKEN,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "heartful-tree-scheduler",
    "Content-Type": "application/json"
  };
  // Keep GitHub's native cron as a fallback without normally duplicating runs.
  const result = await request(endpoint + "/runs?branch=main&per_page=1", {headers});
  if (!result.ok) throw new Error("GitHub run lookup failed: HTTP " + result.status);
  const body = await result.json();
  if (!Array.isArray(body.workflow_runs)) throw new Error("Invalid GitHub run list");
  const latest = body.workflow_runs[0];
  if (latest && latest.status !== "completed") return "skipped: active run";
  if (latest && latest.conclusion === "success" &&
      now - Date.parse(latest.updated_at) < recentMs) return "skipped: recent successful run";
  const dispatch = await request(endpoint + "/dispatches", {
    method: "POST", headers, body: JSON.stringify({ref: "main"})
  });
  if (!dispatch.ok) throw new Error("GitHub dispatch failed: HTTP " + dispatch.status);
  return "dispatched";
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(dispatchIfDue(env).then(result => console.log("HEARTFUL TREE:", result)));
  },
  fetch() {
    return new Response("Not found", {status: 404});
  }
};
