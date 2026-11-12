import { expect, it } from "vite-plus/test";
import {
  browserTestArguments,
  isBrowserTestTask,
  planBrowserTests,
  prepareBrowserTask,
} from "./browser-tests.js";

it("keeps complete browser acceptance as the default and leaves devtools acceptance separate", () => {
  const plan = planBrowserTests([]);
  expect(plan.task).toBe("e2e");
  expect(plan.env).toEqual({
    RAYPX_E2E_SURFACE: "all",
    RAYPX_E2E_SMOKE: "0",
    RAYPX_E2E_SCREENSHOTS: "0",
  });
  expect(isBrowserTestTask("e2e:devtools")).toBe(false);
});
it("combines surface, smoke and visual intent while forwarding normal Playwright arguments", () => {
  const plan = planBrowserTests([
    "--web",
    "--smoke",
    "--visual",
    "--",
    "--grep",
    "template",
    "--workers",
    "2",
  ]);
  const task = prepareBrowserTask(plan.task, plan.args, plan.env);
  expect(plan.task).toBe("e2e:web");
  expect(task.args).toEqual([]);
  expect(browserTestArguments([], task.env)).toEqual(["--workers", "2"]);
  expect(task.env).toMatchObject({
    RAYPX_E2E_SURFACE: "web",
    RAYPX_E2E_SMOKE: "1",
    RAYPX_E2E_SCREENSHOTS: "1",
    RAYPX_E2E_GREP: "template",
  });
});
it.each(["--grep=template", "-g"])(
  "selects the project while preserving grep through %s",
  (flag) => {
    const args = flag === "-g" ? [flag, "template"] : [flag];
    const task = prepareBrowserTask("e2e:desktop", ["--", ...args], {});
    expect(task.env).toMatchObject({ RAYPX_E2E_SURFACE: "desktop", RAYPX_E2E_GREP: "template" });
  },
);
it("forwards explicit trace flags for visual runs", () => {
  const task = prepareBrowserTask("e2e:visual", ["--", "--trace", "on"], {});
  expect(task.args).toEqual([]);
  expect(browserTestArguments([], task.env)).toEqual(["--trace", "on"]);
  expect(task.env.RAYPX_E2E_SCREENSHOTS).toBe("1");
});
it("rejects conflicting surfaces, malformed patterns and alternate configs", () => {
  expect(() => planBrowserTests(["--web", "--desktop"])).toThrow("either");
  expect(() => prepareBrowserTask("e2e", ["--", "--grep"], {})).toThrow("regular expression");
  expect(() => prepareBrowserTask("e2e", ["--", "--grep", "["], {})).toThrow(SyntaxError);
  expect(() => prepareBrowserTask("e2e", ["--", "--config", "custom.ts"], {})).toThrow(
    "compiled-artifact config",
  );
  expect(() => prepareBrowserTask("e2e", [], { RAYPX_E2E_SURFACE: "unknown" })).toThrow("surface");
  expect(() => browserTestArguments([], { RAYPX_E2E_ARGS: "[" })).toThrow(SyntaxError);
  expect(() => browserTestArguments([], { RAYPX_E2E_ARGS: '["valid",2]' })).toThrow("string array");
});

it("passes filename, reporter and literal arguments only to the uncached browser leaf", () => {
  const task = prepareBrowserTask(
    "e2e",
    ["--summarize", "--", "access|memory", "--reporter=list,json"],
    {},
  );
  expect(task.args).toEqual(["--summarize"]);
  expect(browserTestArguments([], task.env)).toEqual(["access|memory", "--reporter=list,json"]);
  expect(browserTestArguments(["--list"], {})).toEqual(["--list"]);
});

it("uses native projects to select builds and rejects conflicting application scope", () => {
  expect(planBrowserTests(["--", "--project=desktop"]).env.RAYPX_E2E_SURFACE).toBe("desktop");
  expect(planBrowserTests(["--", "--project", "web"]).task).toBe("e2e:web");
  expect(planBrowserTests([], "desktop").task).toBe("e2e:desktop");
  expect(() => planBrowserTests(["--web"], "desktop")).toThrow("selected package");
  expect(() => planBrowserTests(["--web", "--", "--project=desktop"])).toThrow("conflicts");
  expect(() => planBrowserTests(["--", "--project=missing"])).toThrow("Playwright project");
  expect(() => planBrowserTests(["--", "--project"])).toThrow("Playwright project");
  expect(planBrowserTests(["--", "--project=web", "--project=desktop"]).task).toBe("e2e");
  expect(planBrowserTests(["--", "--project=control"]).task).toBe("e2e");
  expect(() => planBrowserTests(["--desktop", "--", "--project=control"])).toThrow("conflicts");
  expect(planBrowserTests(["--no-cache", "--", "settings.spec.ts"]).args).toEqual([
    "--no-cache",
    "--",
    "settings.spec.ts",
  ]);
});
