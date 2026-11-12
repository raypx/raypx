import { resolveRelease } from "@raypx/tooling/build/release";
import { developmentEnvironment } from "./repo/environment.js";
import { runBrowserTests } from "./browser-run.js";
import { discover as discoverWorkspaces } from "./repo/workspaces.js";
import { browserTestArguments, isBrowserTestTask, prepareBrowserTask } from "./browser-tests.js";
import { turbo, turboPlan, type TurboOptions } from "./turbo.js";
import { taskRef, workspaceGraph, type Member, type WorkspaceGraph } from "./workspace-graph.js";

/** Raypx conventions for workspace discovery. */
export const discover = (root: string) => discoverWorkspaces(root, { metadataKey: "raypx" });

/** Tasks whose graph compiles applications and therefore reads development configuration. */
const buildsApplications =
  /^(?:dev|build(?::.*)?|e2e(?::.*)?|native:(?:build|prepare|smoke(?::interactive)?|agents)|mygo:smoke)$/;

interface Invocation {
  owner: string | undefined;
  name: string;
  options: string[];
  forwarded: string[];
  dry: boolean;
}

/** Splits `[package#]task [Turbo options] [-- script arguments]`. */
export function parseInvocation(task: string, args: string[]): Invocation {
  const separator = task.lastIndexOf("#");
  const split = args.indexOf("--");
  const flags = split < 0 ? args : args.slice(0, split);
  const filtered = flags.some((flag) => flag === "--filter" || flag.startsWith("--filter="));
  if (separator >= 0 && filtered)
    throw new Error("Use either a qualified task or workspace filters");
  return {
    owner: separator < 0 ? undefined : task.slice(0, separator),
    name: separator < 0 ? task : task.slice(separator + 1),
    forwarded: split < 0 ? [] : args.slice(split + 1),
    dry: flags.includes("--dry-run") || flags.includes("--dry=json"),
    options: flags
      .filter((flag) => flag !== "--dry-run" && flag !== "--dry=json")
      .map((flag) => (flag === "--no-cache" ? "--force" : flag)),
  };
}

export function taskEnvironment(
  root: string,
  name: string,
  extra: Record<string, string> = {},
  development = buildsApplications.test(name),
) {
  const verb = name.split(":")[0]!;
  const inherited = {
    ...(development ? developmentEnvironment(root) : process.env),
    ...extra,
  };
  return {
    ...inherited,
    VITE_APP_RELEASE: resolveRelease(
      root,
      inherited,
      ["verify", "test", "e2e"].includes(verb)
        ? "verification"
        : verb === "dev"
          ? "development"
          : "build",
    ),
  };
}

/** The compiled artifact each browser surface serves during acceptance. */
function browserBuild(member: Member) {
  const script = ["build:e2e", "build:renderer", "build"].find((name) => member.scripts[name]);
  return taskRef(member.name, script ?? "build");
}

/** Build the selected applications through Turbo, then run one shared Playwright process. */
async function runBrowserTask(
  root: string,
  graph: WorkspaceGraph,
  invocation: Invocation,
  environment: Record<string, string>,
) {
  const owner = graph.members.find((member) => member.name === invocation.owner);
  if (owner?.browserProject) {
    if (environment.RAYPX_E2E_SURFACE && environment.RAYPX_E2E_SURFACE !== owner.browserProject)
      throw new Error("Browser surface conflicts with the selected package");
    environment = { ...environment, RAYPX_E2E_SURFACE: owner.browserProject };
  }
  const browser = prepareBrowserTask(
    invocation.name,
    invocation.forwarded.length ? ["--", ...invocation.forwarded] : [],
    environment,
  );
  const surface = browser.env.RAYPX_E2E_SURFACE;
  const builds = graph.members
    .filter(
      (member) => member.browserProject && (surface === "all" || member.browserProject === surface),
    )
    .map(browserBuild);
  const listing = browserTestArguments([], browser.env).includes("--list");
  if (invocation.dry) {
    console.log(JSON.stringify({ runner: "playwright", tasks: listing ? [] : builds }));
    return;
  }
  const env = {
    ...taskEnvironment(root, invocation.name, browser.env),
    // Browser launchers select synthetic analytics for every mode.
    VITE_POSTHOG_PROJECT_TOKEN: "phc_e2e_synthetic",
    VITE_POSTHOG_HOST: "https://analytics.example.test",
  };
  if (!listing && builds.length) await turbo(root, builds, { options: invocation.options, env });
  await runBrowserTests(root, [], env);
}

export async function runTasks(
  root: string,
  task: string,
  args: string[] = [],
  environment: Record<string, string> = {},
): Promise<void> {
  const invocation = parseInvocation(task, args);
  if (isBrowserTestTask(invocation.name)) {
    await runBrowserTask(root, workspaceGraph(root), invocation, environment);
    return;
  }
  const options: TurboOptions = {
    options: invocation.options,
    forwarded: invocation.forwarded,
    env: taskEnvironment(root, invocation.name, environment),
  };
  const tasks = [invocation.owner ? taskRef(invocation.owner, invocation.name) : invocation.name];
  if (invocation.dry) {
    console.log(JSON.stringify({ runner: "turbo", tasks: turboPlan(root, tasks, options) }));
    return;
  }
  await turbo(root, tasks, options);
}
