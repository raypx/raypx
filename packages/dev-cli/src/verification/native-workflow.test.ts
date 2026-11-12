import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vite-plus/test";

type Step = {
  id?: string;
  name?: string;
  uses?: string;
  if?: string;
  "continue-on-error"?: boolean | string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string | number | boolean>;
};
type Job = {
  name?: string;
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
    concurrency?: { group: string };
    on: {
      workflow_call?: { inputs: Record<string, { default: boolean }> };
      workflow_dispatch?: { inputs: Record<string, { default: boolean }> };
    };
  };
const ci = workflow("ci");
const nativeWorkflow = workflow("native");
const native = nativeWorkflow.jobs;
const prepare = native.prepare!.steps!;
const steps = native.verify!.steps!;
const acceptance = Bun.YAML.parse(
  readFileSync(join(root, ".github/actions/native-checks/action.yml"), "utf8"),
) as { inputs: Record<string, { default: string }>; runs: { steps: Step[] } };
const checks = acceptance.runs.steps;
const named = (name: string, entries = steps) => {
  const step = entries.find((candidate) => candidate.name === name);
  if (!step) throw new Error(`Missing native acceptance step: ${name}`);
  return step;
};

it("gates the selected native jobs, including when their matrices are skipped", () => {
  const desktop = ci.jobs.desktop;
  expect(desktop?.name).toBe("Native acceptance");
  expect(native.verify?.name).toBe("Distribution acceptance");
  expect(desktop?.uses).toBe("./.github/workflows/native.yml");
  expect(desktop?.strategy?.matrix.os).toBe(
    "${{ fromJSON(needs.changes.outputs.native_runners) }}",
  );
  expect(desktop?.if).toBe("needs.changes.outputs.native == 'true'");
  expect(
    ci.jobs.source?.steps?.find((step) => step.uses?.startsWith("actions/setup-go@"))?.if,
  ).toBe("matrix.phase == 'checks' && needs.changes.outputs.go == 'true'");
  expect(ci.jobs.foundation?.needs).toContain("desktop");
  expect(desktop?.with?.distribution).toContain("needs.changes.outputs.distribution");
  expect(nativeWorkflow.on.workflow_call?.inputs.distribution?.default).toBe(false);
  expect(native.verify?.needs).toBe("prepare");
  expect(native.verify?.if).toContain("inputs.distribution");
  expect(native.verify?.strategy?.["fail-fast"]).toBe(false);
  expect(native.verify?.strategy?.matrix.phase).toEqual(["checks", "package", "smoke"]);
});

it("runs routine acceptance on the compiler runner without a renderer or artifact handoff", () => {
  const routine = named("Check native inputs", prepare);
  const distribution = named("Check native inputs");
  expect(routine.if).toBe("${{ !inputs.distribution }}");
  expect(distribution.if).toBe("matrix.phase == 'checks'");
  expect(routine.uses).toBe("./.github/actions/native-checks");
  expect(distribution.uses).toBe(routine.uses);
  expect(routine.env?.RAYPX_CLI_PAYLOAD).toBe(native.verify?.env?.RAYPX_CLI_PAYLOAD);
  expect(acceptance.inputs.distribution?.default).toBe("false");
  expect(distribution.with?.distribution).toBe("true");
  expect(prepare.indexOf(routine)).toBeGreaterThan(
    prepare.indexOf(named("Accept the final CLI archive", prepare)),
  );
  expect(named("Prepare distribution renderer", prepare).if).toBe("inputs.distribution");
  expect(named("Transport the immutable CLI directory", prepare).if).toBe("inputs.distribution");
  for (const step of prepare.filter((entry) => entry.uses?.startsWith("actions/upload-artifact@")))
    expect(step.if).toBe("inputs.distribution");
  expect(checks.some((step) => /build:cli|build:desktop/.test(step.run ?? ""))).toBe(false);
});

it("compiles once in prepare and transports an immutable artifact by exact ID", () => {
  expect(native.prepare?.if).toBeUndefined();
  expect(native.verify?.if).toContain("needs.prepare.result == 'success'");
  expect(native.verify?.if).not.toContain("skipped");
  expect(prepare.filter((step) => step.run?.includes("bun run build:cli"))).toHaveLength(1);
  expect(steps.some((step) => /build:cli|prepare:herdr/.test(step.run ?? ""))).toBe(false);
  expect(native.prepare?.outputs?.["cli-artifact-id"]).toContain(
    "steps.cli-payload.outputs.artifact-id",
  );
  const download = steps.find((step) => step.uses?.startsWith("actions/download-artifact@"));
  expect(download?.with?.["artifact-ids"]).toBe("${{ needs.prepare.outputs.cli-artifact-id }}");
  expect(native.verify?.env?.RAYPX_CLI_PAYLOAD).toContain("apps/cli/dist");
  expect(named("Verify prepared CLI and restore executable permissions").run).toContain(
    "distribution.ts verify",
  );
  expect(named("Verify prepared CLI and restore executable permissions").id).toBe("native-inputs");
  expect(
    prepare.findIndex((step) => step.name === "Sign and seal the shared CLI payload"),
  ).toBeLessThan(prepare.findIndex((step) => step.name === "Archive standalone CLI"));
  expect(prepare.findIndex((step) => step.name === "Accept the final CLI archive")).toBeLessThan(
    prepare.findIndex((step) => step.uses?.startsWith("actions/upload-artifact@")),
  );
});

it("verifies the shared payload before running native acceptance", () => {
  const payload = named("Verify prepared CLI", checks);
  const runners = named("Cross-platform process and task runners", checks);
  const herdr = named("Herdr terminal integration", checks);
  const go = named("Desktop MyGo checks", checks);
  for (const step of [herdr, go, runners, named("Installed CLI package", checks)])
    expect(checks.indexOf(step)).toBeGreaterThan(checks.indexOf(payload));
  expect(runners.run).toContain(
    "bun run --cwd packages/task-graph test ./tests/integration/task-leaf.test.ts",
  );
  expect(herdr.env?.RAYPX_HERDR_COMPILED).toBe("1");
  expect(herdr.env?.RAYPX_HERDR_WINDOWS_RUNS).toBe(
    "${{ inputs.distribution == 'true' && '3' || '1' }}",
  );
  expect(go.if).toContain("!cancelled()");
  expect(go.if).toContain("steps.payload.outcome == 'success'");
  expect(payload.id).toBe("payload");
  expect(go.run).toContain("mygo:test");
  expect(go.run).toContain("mygo:check");
  expect(named("Package desktop").if).toBe("matrix.phase == 'package'");
  expect(named("Verify production Desktop excludes smoke controls").if).toBe(
    "matrix.phase == 'package'",
  );
  expect(named("Packaged native smoke").if).toBe("matrix.phase == 'smoke'");
  expect(named("Packaged native smoke").run).toContain("native:smoke:interactive");
});

it("tolerates only report upload failures in routine native acceptance", () => {
  const optional = checks.filter((step) => step["continue-on-error"] !== undefined);
  expect(optional.map((step) => step.name)).toEqual([
    "Upload native acceptance evidence",
    "Upload build size reports",
  ]);
  for (const step of optional) {
    expect(step.uses).toMatch(/^actions\/upload-artifact@/);
    expect(step["continue-on-error"]).toBe("${{ inputs.distribution == 'false' }}");
  }
  expect([...prepare, ...steps].filter((step) => step["continue-on-error"])).toEqual([]);
});

it("keeps explicit release acceptance independent from routine push cancellation", () => {
  const group = ci.concurrency?.group;
  expect(group).toContain("github.event_name");
  expect(group).toContain("inputs.distribution");
  expect(group).toContain("inputs.macos");
  expect(group).toContain("inputs.cold_native");
});

it("exposes distribution credentials only to packaging and always cleans them up", () => {
  for (const [, value] of Object.entries(native.verify!.env!).filter(
    ([key]) => key !== "RAYPX_CLI_PAYLOAD",
  ))
    expect(value).toContain("matrix.phase == 'package'");
  for (const value of Object.values(native.prepare!.env!))
    expect(value).toContain("inputs.distribution");
  expect(named("Remove temporary macOS signing material").if).toContain("always()");
  expect(named("Remove temporary Windows signing material").if).toContain("always()");
});

it("defaults manual CI to Windows and forwards explicit cold native builds", () => {
  expect(ci.on.workflow_dispatch?.inputs.macos?.default).toBe(false);
  expect(ci.on.workflow_dispatch?.inputs.cold_native?.default).toBe(false);
  expect(ci.jobs.desktop?.with?.cold_native).toBe("${{ inputs.cold_native || false }}");
  expect(nativeWorkflow.on.workflow_call?.inputs.cold_native?.default).toBe(false);
  for (const entries of [prepare, steps]) {
    const setup = entries.find((step) => step.uses?.startsWith("actions/setup-go@"));
    expect(setup?.with?.["go-version-file"]).toBe("apps/desktop/go.mod");
    expect(setup?.with?.cache).toBe("${{ !inputs.cold_native }}");
  }
});
