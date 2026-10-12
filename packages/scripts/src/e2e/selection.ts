type BrowserSuite = "all" | "web" | "desktop";

export interface BrowserSelection {
  suite: BrowserSuite;
  group?: string;
  playwrightArgs: string[];
  listOnly: boolean;
}

/** Keep browser flags out of Turbo's argument parser. */
export function browserSelection(args: readonly string[]): BrowserSelection {
  const remaining = [...args];
  if (remaining[0] === "--") remaining.shift();
  const first = remaining[0];
  const suite = first === "all" || first === "web" || first === "desktop" ? first : "all";
  if (first === suite) remaining.shift();

  let group: string | undefined;
  const playwrightArgs: string[] = [];
  for (let index = 0; index < remaining.length; index++) {
    const arg = remaining[index]!;
    // Bun callers may retain the separator used to forward script arguments.
    if (arg === "--" && playwrightArgs.length === 0) continue;
    if (arg === "--group" || arg.startsWith("--group=")) {
      const value = arg === "--group" ? remaining[++index] : arg.slice("--group=".length);
      if (group !== undefined) throw new Error("Select one E2E group per invocation.");
      if (!value || value.startsWith("-")) throw new Error("--group requires a group name.");
      group = value;
    } else {
      playwrightArgs.push(arg);
    }
  }

  return {
    suite,
    ...(group ? { group } : {}),
    playwrightArgs,
    listOnly: playwrightArgs.includes("--list") || playwrightArgs.includes("--help"),
  };
}

export function browserInvocation(selection: BrowserSelection) {
  const task = selection.suite === "all" ? "e2e" : `e2e:${selection.suite}`;
  return selection.listOnly
    ? ["bun", "run", "--cwd", "e2e", task, ...selection.playwrightArgs]
    : [
        "rpx",
        "tasks",
        task,
        "--filter",
        "@raypx/e2e",
        ...(selection.playwrightArgs.length ? ["--", ...selection.playwrightArgs] : []),
      ];
}
