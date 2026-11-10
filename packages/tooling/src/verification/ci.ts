import { readFileSync } from "node:fs";
import { runTasks } from "../repository";
import { taskModel } from "../tasks/model";
import { changedFiles, verificationPlan } from "./plan";
import { distributionRequested } from "./events";
import { ciOutputs, parseCiPlan, requiredGates, sourcePhases } from "./gates";
import { sourceChecks } from "./execution";

export function githubPlan(root: string, eventName: string, event: Record<string, unknown>) {
  const pull = event.pull_request as { base: { sha: string } } | undefined;
  const ref = typeof event.ref === "string" ? event.ref : "";
  const tag = eventName === "push" && ref.startsWith("refs/tags/");
  const full = eventName === "workflow_dispatch" || tag;
  const macos = (event.inputs as Record<string, unknown> | undefined)?.macos;
  const before =
    eventName === "pull_request"
      ? pull?.base.sha
      : typeof event.before === "string"
        ? event.before
        : undefined;
  const changed = before
    ? changedFiles(root, "HEAD", { before, head: "HEAD" })
    : {
        files: [],
        reasons: full ? [] : ["Event base unavailable; checking all sources and native targets"],
      };
  return {
    ...verificationPlan(taskModel(root), changed.files, {
      full,
      reasons: changed.reasons,
      macos: tag || (eventName === "workflow_dispatch" && (macos === true || macos === "true")),
    }),
    distribution: distributionRequested(
      eventName,
      ref,
      (event.inputs as Record<string, unknown> | undefined)?.distribution,
    ),
  };
}

export function readGithubPlan(root: string) {
  const file = process.env.GITHUB_EVENT_PATH;
  const event = file ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>) : {};
  return githubPlan(root, process.env.GITHUB_EVENT_NAME ?? "workflow_dispatch", event);
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
    const { smokeDeployment } = await import("../validation/deployment-smoke");
    await smokeDeployment(root, []);
  } else if (gate === "backend") {
    for (const task of ["test:postgres", "test:redis", "test:cluster"])
      await runTasks(root, `api#${task}`);
  } else if (gate === "browser") {
    const { reportBuildSizes } = await import("../validation/build-size");
    await runTasks(root, `@raypx/e2e#${plan.browser === "all" ? "e2e" : `e2e:${plan.browser}`}`);
    reportBuildSizes(root, {
      packages: plan.browser === "all" ? ["web", "desktop"] : [plan.browser],
      browser: true,
      required: true,
    });
  } else throw new Error("Unknown internal CI gate");
}
