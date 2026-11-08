import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vite-plus/test";

type Step = {
  id?: string;
  name?: string;
  uses?: string;
  if?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string | number | boolean>;
};
type Job = {
  if?: string;
  needs?: string | string[];
  uses?: string;
  with?: Record<string, string>;
  env?: Record<string, string>;
  outputs?: Record<string, string>;
  steps?: Step[];
  strategy?: { "fail-fast": boolean; matrix: Record<string, string[] | string> };
};
const root = resolve(import.meta.dirname, "../../../..");
const workflow = (name: string) =>
  Bun.YAML.parse(readFileSync(join(root, `.github/workflows/${name}.yml`), "utf8")) as {
    jobs: Record<string, Job>;
    concurrency?: { group?: string };
    on: {
      workflow_call?: { inputs: Record<string, { default: boolean }> };
      workflow_dispatch?: { inputs: Record<string, { default: boolean }> };
    };
  };
const native = workflow("native").jobs;
const steps = native.verify!.steps!;
const named = (name: string) => {
  const step = steps.find((candidate) => candidate.name === name);
  if (!step) throw new Error(`Missing native acceptance step: ${name}`);
  return step;
};

it("checks selected platforms and adds parallel distribution phases only when requested", () => {
  const ci = workflow("ci").jobs;
  expect(ci.desktop?.uses).toBe("./.github/workflows/native.yml");
  expect(ci.desktop?.strategy?.matrix.os).toBe(
    "${{ fromJSON(needs.changes.outputs.native_runners) }}",
  );
  expect(ci.desktop?.if).toBe("needs.changes.outputs.native == 'true'");
  expect(ci.javascript?.steps?.some((step) => step.uses === "./.github/actions/setup-rust")).toBe(
    true,
  );
  expect(ci.foundation?.needs).toContain("desktop");
  expect(ci.desktop?.with?.distribution).toContain("needs.changes.outputs.distribution");
  expect(workflow("native").on.workflow_call?.inputs.distribution?.default).toBe(false);
  expect(native.verify?.needs).toBe("prepare");
  expect(native.verify?.strategy?.["fail-fast"]).toBe(false);
  const selection = native.verify!.strategy!.matrix.phase as string;
  expect(selection).toContain("inputs.distribution &&");
  expect(selection.match(/\[[^\]]+\]/g)?.map((json) => JSON.parse(json))).toEqual([
    ["checks", "package", "smoke"],
    ["checks"],
  ]);
});

it("prepares shared JS inputs only for parallel distribution phases", () => {
  const prepare = native.prepare!.steps!;
  expect(native.prepare?.if).toBeUndefined();
  expect(native.verify?.if).toContain("!cancelled()");
  expect(native.verify?.if).toContain("needs.prepare.result == 'success'");
  expect(prepare.some((step) => step.name === "Herdr terminal integration")).toBe(false);
  expect(prepare.some((step) => step.uses === "./.github/actions/setup-rust")).toBe(false);
  expect(prepare.at(-1)?.uses).toBe("./.github/actions/vp-save");
  expect(prepare.some((step) => step.uses === "Swatinem/rust-cache@v2")).toBe(false);
  expect(steps.some((step) => step.uses === "./.github/actions/vp-save")).toBe(false);
  expect(prepare.filter((step) => step.run?.includes("bun run build:cli"))).toHaveLength(1);
  expect(steps.some((step) => step.run?.includes("bun run build:cli"))).toBe(false);
  expect(native.prepare?.outputs?.["cli-artifact-id"]).toContain(
    "steps.cli-payload.outputs.artifact-id",
  );
  expect(
    steps.find((step) => step.uses?.startsWith("actions/download-artifact@"))?.with?.[
      "artifact-ids"
    ],
  ).toBe("${{ needs.prepare.outputs.cli-artifact-id }}");
  expect(prepare.some((step) => step.name === "Sign and seal the shared CLI payload")).toBe(true);
  expect(named("Prepare native check or distribution inputs").run).toContain(
    "distribution.ts verify",
  );
  expect(native.verify?.env?.RAYPX_CLI_PAYLOAD).toContain("apps/cli/dist");
});

it("requires compiled Herdr integration and pinned Rust checks in the check phase", () => {
  const herdr = named("Herdr terminal integration");
  expect(herdr.if).toBe("matrix.phase == 'checks'");
  expect(herdr.env?.RAYPX_HERDR_WINDOWS_RUNS).toBe("${{ inputs.distribution && '3' || '1' }}");
  expect(herdr.run).toContain('process.platform === "win32"');
  expect(herdr.run).toContain("RAYPX_HERDR_WINDOWS_RUNS");
  expect(steps.indexOf(named("Prepare native check or distribution inputs"))).toBeLessThan(
    steps.indexOf(herdr),
  );
  expect(steps.some((step) => step.uses === "./.github/actions/setup-rust")).toBe(true);
});

it("restores Cargo before JavaScript dependencies enter the cache scan", () => {
  for (const job of [native.verify!, workflow("ci").jobs.javascript!]) {
    const jobSteps = job.steps!;
    const rust = jobSteps.findIndex((step) => step.uses === "./.github/actions/setup-rust");
    const bun = jobSteps.findIndex((step) => step.uses === "./.github/actions/setup-bun");
    expect(rust).toBeGreaterThanOrEqual(0);
    expect(bun).toBeGreaterThan(rust);
  }
});

it("accepts process runners and the installed CLI after verifying the shared payload", () => {
  const inputs = named("Prepare native check or distribution inputs");
  const runners = named("Cross-platform process and task runners");
  const firewall = named("Enable Windows Firewall for isolated provider acceptance");
  const cli = named("Installed CLI package");
  expect(inputs.id).toBe("native-inputs");
  for (const step of [runners, cli]) {
    expect(step.if).toBe("matrix.phase == 'checks'");
    expect(steps.indexOf(step)).toBeGreaterThan(steps.indexOf(inputs));
    expect(steps.indexOf(step)).toBeLessThan(steps.indexOf(named("Herdr terminal integration")));
  }
  expect(runners.run).toContain("bun run --cwd packages/runtime-node test");
  for (const test of [
    "tests/integration/task-leaf.test.ts",
    "src/build/archive.test.ts",
    "src/validation/build-size.test.ts",
  ])
    expect(runners.run).toContain(test);
  expect(cli.run).toBe("bun run --cwd apps/cli smoke");
  expect(firewall.if).toBe("matrix.phase == 'checks' && runner.os == 'Windows'");
  expect(firewall.run).toContain(
    "Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True",
  );
  expect(steps.indexOf(firewall)).toBeGreaterThan(steps.indexOf(inputs));
  expect(steps.indexOf(firewall)).toBeLessThan(steps.indexOf(cli));
  expect(named("Report prepared build sizes").run).toContain("--package cli --require");
});

it("retains Rust, production and interactive smoke acceptance", () => {
  expect(named("Desktop Tauri checks").if).toContain("!cancelled()");
  expect(named("Desktop Tauri checks").if).toContain("matrix.phase == 'checks'");
  expect(named("Desktop Tauri checks").if).toContain("steps.native-inputs.outcome == 'success'");
  expect(named("Desktop Tauri checks").run).toContain("tauri:test");
  expect(named("Desktop Tauri checks").run).toContain("tauri:check");
  expect(named("Package desktop").if).toBe("matrix.phase == 'package'");
  expect(named("Verify production Desktop excludes smoke controls").if).toBe(
    "matrix.phase == 'package'",
  );
  expect(named("Packaged native smoke").if).toBe("matrix.phase == 'smoke'");
  expect(named("Packaged native smoke").run).toContain("native:smoke:interactive");
  expect(named("Preserve prepared Desktop delivery").if).toBe("matrix.phase == 'package'");
  expect(named("Preserve prepared Desktop delivery").run).toContain("verifyCliPayload");
  expect(named("Preserve prepared Desktop delivery").run).toContain("GITHUB_SHA");
  expect(named("Upload native acceptance evidence").with?.path).toContain(".artifacts/cli/*.json");
  for (const name of ["Upload native acceptance evidence", "Upload build size reports"]) {
    expect(named(name).if).toBe("always()");
    expect(named(name).with?.["retention-days"]).toBe(7);
  }
});

it("keeps explicit release acceptance independent from routine push cancellation", () => {
  const group = workflow("ci").concurrency?.group;
  expect(group).toContain("github.event_name");
  expect(group).toContain("inputs.distribution");
  expect(group).toContain("inputs.macos");
  expect(group).toContain("inputs.cold_native");
});

it("exposes distribution credentials only to packaging and always cleans them up", () => {
  const credentials = Object.entries(native.verify!.env!).filter(
    ([key]) => key !== "RAYPX_CLI_PAYLOAD",
  );
  for (const [, value] of credentials) expect(value).toContain("matrix.phase == 'package'");
  expect(named("Remove temporary macOS signing material").if).toContain("always()");
  expect(named("Remove temporary Windows signing material").if).toContain("always()");
});

it("defaults manual CI to Windows and forwards explicit cold native builds", () => {
  const ci = workflow("ci");
  expect(ci.on.workflow_dispatch?.inputs.macos?.default).toBe(false);
  expect(ci.on.workflow_dispatch?.inputs.cold_native?.default).toBe(false);
  expect(ci.jobs.desktop?.with?.cold_native).toBe("${{ inputs.cold_native || false }}");
  expect(workflow("native").on.workflow_call?.inputs.cold_native?.default).toBe(false);
  const rustSteps = Object.values(native)
    .flatMap((job) => job.steps ?? [])
    .filter((step) => step.uses === "./.github/actions/setup-rust");
  expect(rustSteps).toHaveLength(1);
  for (const step of rustSteps) expect(step.with?.cache).toBe("${{ !inputs.cold_native }}");
  expect(rustSteps[0]?.with?.["check-profile"]).toBe("${{ matrix.phase == 'checks' }}");
  expect(
    ci.jobs.javascript?.steps?.find((step) => step.uses === "./.github/actions/setup-rust")?.with?.[
      "check-profile"
    ],
  ).toBe("true");
  expect(rustSteps[0]?.with?.["cache-key"]).toBe("${{ matrix.phase }}");
  expect(rustSteps[0]?.with?.["target-directory"]).toBe(
    "${{ matrix.phase == 'smoke' && 'target/native-smoke' || 'target' }}",
  );
  const rust = Bun.YAML.parse(
    readFileSync(join(root, ".github/actions/setup-rust/action.yml"), "utf8"),
  ) as {
    inputs: Record<string, { default: string }>;
    runs: { steps: Step[] };
  };
  expect(rust.inputs.cache?.default).toBe("true");
  expect(rust.inputs["check-profile"]?.default).toBe("false");
  expect(
    rust.runs.steps.find((step) => step.uses === "Swatinem/rust-cache@v2")?.with?.[
      "cache-on-failure"
    ],
  ).toBe("true");
  expect(rust.runs.steps.find((step) => step.uses === "Swatinem/rust-cache@v2")?.with?.key).toBe(
    "${{ inputs.cache-key }}",
  );
  expect(rust.runs.steps.find((step) => step.uses === "Swatinem/rust-cache@v2")?.if).toBe(
    "inputs.cache == 'true'",
  );
});
