const tasks = ["e2e", "e2e:web", "e2e:desktop", "e2e:smoke", "e2e:visual"] as const;
export const isBrowserTestTask = (task: string) => tasks.some((value) => value === task);
type Environment = Record<string, string | undefined>;

/** CLI intent only; VP owns the build/run graph. */
export function planBrowserTests(argv: string[]) {
  let surface: "web" | "desktop" | undefined;
  let smoke = false,
    visual = false,
    dry = false;
  const forwarded: string[] = [];
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
    else forwarded.push(value);
  }
  return {
    task: surface ? `e2e:${surface}` : smoke ? "e2e:smoke" : visual ? "e2e:visual" : "e2e",
    args: [dry ? "--dry-run" : "--verbose", ...(forwarded.length ? ["--", ...forwarded] : [])],
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
      throw new Error(
        "Browser acceptance uses its compiled-artifact config; run e2e:live separately",
      );
    else forwarded.push(value);
  }
  if (grep) grep = new RegExp(grep).source;
  return {
    // Keep browser flags scoped to the uncached leaf, outside build fingerprints.
    args: before,
    env: {
      RAYPX_E2E_SURFACE: task === "e2e:web" ? "web" : task === "e2e:desktop" ? "desktop" : "all",
      RAYPX_E2E_SMOKE: task === "e2e:smoke" ? "1" : "0",
      RAYPX_E2E_SCREENSHOTS: task === "e2e:visual" ? "1" : "0",
      ...environment,
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

/** Shared by the launcher and Playwright config, with no product/runtime imports. */
export function browserTestSettings(
  environment: Environment,
  capacity?: { cpus: number; memoryBytes: number },
) {
  const surface = environment.RAYPX_E2E_SURFACE ?? "all";
  if (!["all", "web", "desktop"].includes(surface)) throw new Error("Invalid E2E surface");
  const clauses = [
    ...(surface === "all" ? [] : [`@${surface}\\b`]),
    ...(environment.RAYPX_E2E_SMOKE === "1" ? ["@smoke\\b"] : []),
    ...(environment.RAYPX_E2E_GREP ? [environment.RAYPX_E2E_GREP] : []),
  ];
  return {
    surface,
    grep: clauses.length
      ? new RegExp(clauses.map((pattern) => `(?=.*(?:${pattern}))`).join("") + ".*")
      : undefined,
    trace: environment.CI ? ("on-first-retry" as const) : ("off" as const),
    screenshots: environment.RAYPX_E2E_SCREENSHOTS === "1",
    workers:
      environment.CI || !capacity
        ? 2
        : capacity.cpus >= 8 && capacity.memoryBytes >= 16 * 2 ** 30
          ? 4
          : Math.max(1, Math.min(2, capacity.cpus)),
  };
}
