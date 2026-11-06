import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vite-plus/test";

type Step = {
  name?: string;
  uses?: string;
  if?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
};
type Job = {
  if?: string;
  needs?: string | string[];
  uses?: string;
  with?: Record<string, string>;
  env?: Record<string, string>;
  steps?: Step[];
  strategy?: { "fail-fast": boolean; matrix: Record<string, string[] | string> };
};
const root = resolve(import.meta.dirname, "../../../..");
const workflow = (name: string) =>
  Bun.YAML.parse(readFileSync(join(root, `.github/workflows/${name}.yml`), "utf8")) as {
    jobs: Record<string, Job>;
    concurrency?: { group?: string };
    on: { workflow_call?: { inputs: { distribution: { default: boolean } } } };
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
  expect(workflow("native").on.workflow_call?.inputs.distribution.default).toBe(false);
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
  expect(prepare.some((step) => step.uses === "./.github/actions/setup-rust")).toBe(true);
  expect(prepare.at(-1)?.uses).toBe("./.github/actions/vp-save");
  expect(prepare.some((step) => step.uses === "Swatinem/rust-cache@v2")).toBe(false);
  expect(steps.some((step) => step.uses === "./.github/actions/vp-save")).toBe(false);
  expect(prepare.filter((step) => step.run?.includes("bun run build:cli"))).toHaveLength(1);
  expect(steps.some((step) => step.run?.includes("bun run build:cli"))).toBe(false);
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
  expect(herdr.run).toContain("$RUNNER_OS");
  expect(herdr.run).toContain("RAYPX_HERDR_WINDOWS_RUNS");
  expect(steps.indexOf(named("Prepare native check or distribution inputs"))).toBeLessThan(
    steps.indexOf(herdr),
  );
  expect(steps.some((step) => step.uses === "./.github/actions/setup-rust")).toBe(true);
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
});

it("keeps explicit release acceptance independent from routine push cancellation", () => {
  const group = workflow("ci").concurrency?.group;
  expect(group).toContain("github.event_name");
  expect(group).toContain("inputs.distribution");
});

it("exposes distribution credentials only to packaging and always cleans them up", () => {
  const credentials = Object.entries(native.verify!.env!).filter(
    ([key]) => key !== "RAYPX_CLI_PAYLOAD",
  );
  for (const [, value] of credentials) expect(value).toContain("matrix.phase == 'package'");
  expect(named("Remove temporary macOS signing material").if).toContain("always()");
  expect(named("Remove temporary Windows signing material").if).toContain("always()");
});
