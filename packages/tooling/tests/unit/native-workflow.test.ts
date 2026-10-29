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
    concurrency?: { group: string };
    on: { workflow_call?: { inputs: { distribution: { default: boolean } } } };
  };
const native = workflow("native").jobs;
const steps = native.verify!.steps!;
const named = (name: string) => {
  const step = steps.find((candidate) => candidate.name === name);
  if (!step) throw new Error(`Missing native acceptance step: ${name}`);
  return step;
};

it("checks both platforms and adds parallel distribution phases only when requested", () => {
  const ci = workflow("ci").jobs;
  expect(ci.desktop?.uses).toBe("./.github/workflows/native.yml");
  expect(ci.desktop?.strategy?.matrix.os).toEqual(["macos-latest", "windows-latest"]);
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
  expect(native.prepare?.if).toBe("inputs.distribution");
  expect(native.verify?.if).toContain("!cancelled()");
  expect(native.verify?.if).toContain("needs.prepare.result == 'skipped'");
  expect(prepare.some((step) => step.name === "Herdr terminal integration")).toBe(false);
  expect(prepare.some((step) => step.uses === "./.github/actions/setup-rust")).toBe(false);
  expect(prepare.at(-1)?.uses).toBe("./.github/actions/vp-save");
  expect(prepare.some((step) => step.uses === "Swatinem/rust-cache@v2")).toBe(false);
  const saves = steps.filter((step) => step.uses === "./.github/actions/vp-save");
  expect(saves.map((step) => step.if)).toEqual(["${{ !inputs.distribution }}"]);
  expect(steps.indexOf(saves[0]!)).toBe(
    steps.indexOf(named("Prepare native check or distribution inputs")) + 1,
  );
});

it("requires compiled Herdr integration and pinned Go checks in the check phase", () => {
  const herdr = named("Herdr terminal integration");
  expect(herdr.if).toBe("matrix.phase == 'checks'");
  expect(herdr.env?.RAYPX_HERDR_WINDOWS_RUNS).toBe("${{ inputs.distribution && '3' || '1' }}");
  expect(herdr.run).toContain('process.platform === "win32"');
  expect(herdr.run).toContain("RAYPX_HERDR_WINDOWS_RUNS");
  expect(steps.indexOf(named("Prepare Herdr runtime"))).toBeLessThan(steps.indexOf(herdr));
  const go = steps.find((step) => step.uses === "actions/setup-go@v6")!;
  expect(go.with?.["go-version-file"]).toBe("apps/desktop/go.mod");
  expect(go.with?.["cache-dependency-path"]).toBe("apps/desktop/go.sum");
  expect(steps.some((step) => step.uses === "Swatinem/rust-cache@v2")).toBe(false);
});

it("retains Go, production and interactive smoke acceptance", () => {
  expect(named("Desktop MyGo checks").if).toBe("matrix.phase == 'checks'");
  expect(named("Desktop MyGo checks").run).toContain("mygo:test");
  expect(named("Desktop MyGo checks").run).toContain("go vet -tags native_smoke");
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
  for (const value of Object.values(native.verify!.env!))
    expect(value).toContain("matrix.phase == 'package'");
  expect(named("Remove temporary macOS signing material").if).toContain("always()");
  expect(named("Remove temporary Windows signing material").if).toContain("always()");
});
