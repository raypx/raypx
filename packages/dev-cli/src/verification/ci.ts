import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runTasks } from "../repository.js";
import { taskModel } from "@raypx/task-graph/model";
import { changedFiles, verificationPlan } from "./plan.js";
import { distributionRequested } from "./events.js";
import { ciOutputs, parseCiPlan, requiredGates, sourcePhases, type CiPlan } from "./gates.js";
import { sourceChecks } from "./execution.js";

const canaryRef = "refs/heads/canary";
const canaryBaselinePolicy = "# raypx canary baseline policy v1";

export function githubPlan(
  root: string,
  eventName: string,
  event: Record<string, unknown>,
  canaryBase?: string,
): CiPlan {
  const pull = event.pull_request as { base: { sha: string } } | undefined;
  const ref = typeof event.ref === "string" ? event.ref : "";
  const tag = eventName === "push" && ref.startsWith("refs/tags/");
  const canary = eventName === "push" && ref === canaryRef;
  const establishBaseline = canary && !canaryBase;
  const full = eventName === "workflow_dispatch" || tag || establishBaseline;
  const macos = (event.inputs as Record<string, unknown> | undefined)?.macos;
  let before = typeof event.before === "string" ? event.before : undefined;
  if (canary) before = canaryBase;
  if (eventName === "pull_request") before = pull?.base.sha;
  const reasons: string[] = [];
  if (establishBaseline)
    reasons.push("No verified canary ancestor; establishing a baseline with full verification");
  else if (tag) reasons.push("Release tag requests full verification");
  else if (eventName === "workflow_dispatch") reasons.push("Manual run requests full verification");
  else if (!before) reasons.push("Event base unavailable; checking all sources and native targets");
  const changed = before
    ? changedFiles(root, "HEAD", { before, head: "HEAD" })
    : { files: [], reasons: [] };
  const baseline =
    before && /^[0-9a-f]{40}$/.test(before) && !changed.reasons.length ? before : undefined;
  return {
    ...verificationPlan(taskModel(root), changed.files, {
      full,
      reasons: [...reasons, ...changed.reasons],
      macos: tag || (eventName === "workflow_dispatch" && (macos === true || macos === "true")),
    }),
    ...(baseline ? { baseline } : {}),
    distribution: distributionRequested(
      eventName,
      ref,
      (event.inputs as Record<string, unknown> | undefined)?.distribution,
    ),
  };
}

async function verifiedCanaryAncestor(root: string) {
  const {
    GITHUB_API_URL: api,
    GITHUB_REPOSITORY: repository,
    GITHUB_SHA: head,
    GITHUB_TOKEN: token,
  } = process.env;
  if (!api || !repository || !head || !token) return;
  const url = new URL(`${api}/repos/${repository}/actions/workflows/ci.yml/runs`);
  url.search = new URLSearchParams({
    branch: "canary",
    event: "push",
    status: "success",
    per_page: "100",
  }).toString();
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return;
    const { workflow_runs: runs } = (await response.json()) as {
      workflow_runs?: { head_sha: string; display_title: string; conclusion: string }[];
    };
    if (!Array.isArray(runs)) return;
    for (const run of runs) {
      const sha = run.head_sha;
      if (run.conclusion !== "success" || sha === head || !/^[0-9a-f]{40}$/.test(sha)) continue;
      if (
        spawnSync("git", ["merge-base", "--is-ancestor", sha, "HEAD"], { cwd: root }).status !== 0
      )
        continue;
      // Existing v1 runs encoded the policy in their title. New runs record it in ci.yml.
      if (run.display_title === `Canary CI v1 ${sha}`) return sha;
      const workflow = spawnSync("git", ["show", `${sha}:.github/workflows/ci.yml`], {
        cwd: root,
        encoding: "utf8",
      });
      if (workflow.status === 0 && workflow.stdout.split(/\r?\n/).includes(canaryBaselinePolicy))
        return sha;
    }
  } catch {
    // An unavailable Actions API cannot be used as proof of verification.
  }
}

export async function readGithubPlan(root: string) {
  const file = process.env.GITHUB_EVENT_PATH;
  const event = file ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>) : {};
  const name = process.env.GITHUB_EVENT_NAME ?? "workflow_dispatch";
  const canaryBase =
    name === "push" && event.ref === canaryRef ? await verifiedCanaryAncestor(root) : undefined;
  return githubPlan(root, name, event, canaryBase);
}

/** Workers consume the commit-bound plan; local verification has no CI prerequisites. */
export async function ciGate(root: string, args: string[]) {
  const plan = parseCiPlan(process.env.RAYPX_CI_PLAN ?? "{}", process.env.GITHUB_SHA ?? ""),
    [gate, phase] = args;
  const decision = requiredGates(ciOutputs(plan, process.env.GITHUB_SHA ?? "")).find(
    (entry) => entry.name === gate,
  );
  if (!decision || decision.name === "desktop" || args.length !== (gate === "source" ? 2 : 1))
    throw new Error("Unknown internal CI gate");
  if (!decision.required) throw new Error(`CI gate ${gate} was not selected by change analysis`);
  if (gate === "source") {
    if (phase !== "checks" && phase !== "tests") throw new Error("Unknown source CI phase");
    if (!sourcePhases(plan).includes(phase))
      throw new Error(`Source CI phase ${phase} was not selected by change analysis`);
    await sourceChecks(root, plan, { phase });
  } else if (gate === "container-smoke") {
    const { smokeDeployment } = await import("../validation/deployment-smoke.js");
    await smokeDeployment(root, []);
  } else if (gate === "backend") {
    for (const task of ["test:postgres", "test:redis", "test:cluster"])
      await runTasks(root, `api#${task}`);
  } else if (gate === "browser") {
    const { reportBuildSizes } = await import("../validation/build-size.js");
    const { web, desktop } = plan.browser;
    const packages = (["web", "desktop"] as const).filter(
      (surface) => plan.browser[surface].mode !== "none",
    );
    if (web.mode === desktop.mode) {
      await runTasks(root, web.mode === "smoke" ? "@raypx/e2e#e2e:smoke" : "@raypx/e2e#e2e");
    } else {
      for (const surface of packages)
        await runTasks(root, `@raypx/e2e#e2e:${surface}`, [], {
          RAYPX_E2E_SMOKE: plan.browser[surface].mode === "smoke" ? "1" : "0",
        });
    }
    reportBuildSizes(root, { packages, browser: true, required: true });
  } else throw new Error("Unknown internal CI gate");
}
