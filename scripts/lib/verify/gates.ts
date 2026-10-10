interface GateDetails {
  id: string;
  label: string;
  timeoutMs: number;
}

export type VerifyGate =
  | (GateDetails & { kind: "command"; command: string; args: readonly string[] })
  | (GateDetails & { kind: "consumer" });

const minute = 60_000;
const command = (id: string, label: string, timeoutMs: number, args: string[]): VerifyGate => ({
  id,
  label,
  timeoutMs,
  kind: "command",
  command: "bun",
  args: ["--no-env-file", ...args],
});
const vp = (...args: string[]) => ["--no-install", "run", "vp", ...args];

/** Source checks precede build; public declarations and generated routes precede typed checks. */
export const verifyGates: readonly VerifyGate[] = [
  command("env", "Development environment", 30_000, [
    "--no-install",
    "packages/config/src/environment.ts",
  ]),
  command("deps", "Dependency compatibility", minute, [
    "--no-install",
    "scripts/bin/raypx.ts",
    "deps",
  ]),
  command("policy", "Repository policy", minute, [
    "--no-install",
    "scripts/bin/raypx.ts",
    "policy",
  ]),
  command("fmt", "Formatting", 2 * minute, vp("fmt", "--check")),
  command("boundaries", "Package boundaries", minute, [
    "--no-install",
    "packages/config/src/check-boundaries.ts",
  ]),
  {
    id: "knip",
    label: "Unused code and dependencies",
    timeoutMs: 2 * minute,
    kind: "command",
    command: "node",
    // Bun resolves a same-name knip.ts before its installed executable.
    args: ["node_modules/knip/bin/knip.js", "--config", "knip.ts"],
  },
  command("build", "Workspace artifacts", 10 * minute, vp("run", "--filter", "@raypx/*", "build")),
  command("lint", "Typed lint", 3 * minute, vp("lint", "--deny-warnings")),
  command(
    "types:workspaces",
    "Workspace types",
    5 * minute,
    vp("run", "--filter", "@raypx/*", "typecheck"),
  ),
  command("types:scripts", "Script types", 2 * minute, [
    "--no-install",
    "run",
    "tsc",
    "-p",
    "scripts/tsconfig.json",
  ]),
  command(
    "tests:workspaces",
    "Workspace tests",
    10 * minute,
    vp("run", "--filter", "@raypx/*", "test"),
  ),
  command("tests:scripts", "Script tests", 3 * minute, vp("test", "run", "--project", "scripts")),
  command("storybook", "Storybook artifact", 5 * minute, vp("run", "@raypx/ui#storybook-build")),
  { id: "consumer", label: "Independent consumers", kind: "consumer", timeoutMs: 10 * minute },
];
