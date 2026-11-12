const browserTestTasks = ["e2e", "e2e:web", "e2e:desktop", "e2e:smoke", "e2e:visual"] as const;
export const isBrowserTestTask = (task: string) => browserTestTasks.some((value) => value === task);
type Environment = Record<string, string | undefined>;

export type BrowserSurface = "web" | "desktop";

/** Resolve native Playwright projects before VP chooses prerequisites or servers. */
function selectedSurface(args: string[], selected?: BrowserSurface): BrowserSurface | undefined {
  const projects = new Set<BrowserSurface | "control">();
  for (let index = 0; index < args.length; index++) {
    const value = args[index]!;
    const project =
      value === "--project"
        ? args[++index]
        : value.startsWith("--project=")
          ? value.slice(10)
          : undefined;
    if (value !== "--project" && !value.startsWith("--project=")) continue;
    if (project !== "web" && project !== "desktop" && project !== "control")
      throw new Error("Choose a Playwright project: web, desktop or the real-backend control gate");
    projects.add(project);
  }
  if (selected && projects.size && (projects.size !== 1 || !projects.has(selected)))
    throw new Error("Playwright project conflicts with the selected browser surface");
  // The real-backend control journey crosses both applications.
  return (
    selected ??
    (projects.size === 1 && !projects.has("control")
      ? ([...projects][0] as BrowserSurface)
      : undefined)
  );
}

/** CLI intent only; VP owns the build/run graph. */
export function planBrowserTests(argv: string[], project?: BrowserSurface) {
  let surface: "web" | "desktop" | undefined;
  let smoke = false,
    visual = false,
    dry = false;
  const forwarded: string[] = [];
  const controls: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]!;
    if (value === "--") {
      forwarded.push(...argv.slice(index + 1));
      break;
    }
    if (value === "--web" || value === "--desktop") {
      const next = value === "--web" ? "web" : "desktop";
      if (surface && surface !== next) throw new Error("Choose either --web or --desktop");
      surface = next;
    } else if (value === "--smoke") smoke = true;
    else if (value === "--visual") visual = true;
    else if (value === "--dry-run") dry = true;
    else if (value === "--no-cache" || value === "--verbose") controls.push(value);
    else forwarded.push(value);
  }
  if (project && surface && project !== surface)
    throw new Error("Browser surface conflicts with the selected package");
  surface = selectedSurface(forwarded, project ?? surface);
  return {
    task: surface ? `e2e:${surface}` : smoke ? "e2e:smoke" : visual ? "e2e:visual" : "e2e",
    args: [
      ...(dry ? ["--dry-run"] : []),
      ...controls,
      ...(forwarded.length ? ["--", ...forwarded] : []),
    ],
    env: {
      RAYPX_E2E_SURFACE: surface ?? "all",
      RAYPX_E2E_SMOKE: smoke ? "1" : "0",
      RAYPX_E2E_SCREENSHOTS: visual ? "1" : "0",
    },
  };
}

/** Consume grep once so a user filter cannot replace the selected surface/smoke gate. */
export function prepareBrowserTask(task: string, args: string[], environment: Environment) {
  const separator = args.indexOf("--");
  const before = separator < 0 ? args : args.slice(0, separator);
  const after = separator < 0 ? [] : args.slice(separator + 1);
  const forwarded: string[] = [];
  let grep = "";
  for (let index = 0; index < after.length; index++) {
    const value = after[index]!;
    if (value === "--grep" || value === "-g") {
      const pattern = after[++index];
      if (!pattern) throw new Error("--grep requires a regular expression");
      grep = pattern;
    } else if (value.startsWith("--grep=")) grep = value.slice(7);
    else if (value === "--config" || value === "-c" || value.startsWith("--config="))
      throw new Error("Browser acceptance uses its compiled-artifact config");
    else forwarded.push(value);
  }
  if (grep) grep = new RegExp(grep).source;
  const requested =
    environment.RAYPX_E2E_SURFACE ??
    (task === "e2e:web" ? "web" : task === "e2e:desktop" ? "desktop" : "all");
  if (!["all", "web", "desktop"].includes(requested)) throw new Error("Invalid E2E surface");
  const surface =
    selectedSurface(forwarded, requested === "all" ? undefined : (requested as BrowserSurface)) ??
    "all";
  return {
    // Keep browser flags scoped to the uncached leaf, outside build fingerprints.
    args: before,
    env: {
      RAYPX_E2E_SMOKE: task === "e2e:smoke" ? "1" : "0",
      RAYPX_E2E_SCREENSHOTS: task === "e2e:visual" ? "1" : "0",
      ...environment,
      RAYPX_E2E_SURFACE: surface,
      RAYPX_E2E_GREP: grep,
      RAYPX_E2E_ARGS: JSON.stringify(forwarded),
    },
  };
}

/** Decode only in the browser leaf; exec argv is never interpreted by a shell. */
export function browserTestArguments(args: string[], environment: Environment): string[] {
  const scoped: unknown = JSON.parse(environment.RAYPX_E2E_ARGS ?? "[]");
  if (!Array.isArray(scoped) || scoped.some((value) => typeof value !== "string"))
    throw new Error("Browser test arguments must be a string array");
  return [...scoped, ...args];
}
