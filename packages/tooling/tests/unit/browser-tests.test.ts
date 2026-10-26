import { expect, it } from "vite-plus/test";
import {
  browserTestSettings,
  isBrowserTestTask,
  planBrowserTests,
  prepareBrowserTask,
} from "../../src/browser-tests.js";

it("keeps complete browser acceptance as the default and leaves live acceptance separate", () => {
  const plan = planBrowserTests([]);
  expect(plan.task).toBe("e2e");
  expect(browserTestSettings(plan.env).grep).toBeUndefined();
  expect(isBrowserTestTask("e2e:live")).toBe(false);
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
  const settings = browserTestSettings(task.env);
  expect(plan.task).toBe("e2e:web");
  expect(task.args).toEqual(["--summarize", "--", "--workers", "2"]);
  expect(settings.screenshots).toBe(true);
  expect(settings.grep?.test("chromium memory.spec.ts Web versions a template @web @smoke")).toBe(
    true,
  );
  expect(
    settings.grep?.test("chromium memory.spec.ts Desktop versions a template @desktop @smoke"),
  ).toBe(false);
  expect(settings.grep?.test("chromium memory.spec.ts Web versions a template @web")).toBe(false);
  expect(settings.grep?.test("chromium memory.spec.ts Web visits memory @web @smoke")).toBe(false);
});
it.each(["--grep=template", "-g"])("preserves the platform restriction through %s", (flag) => {
  const args = flag === "-g" ? [flag, "template"] : [flag];
  const task = prepareBrowserTask("e2e:desktop", ["--", ...args], {});
  const settings = browserTestSettings(task.env);
  expect(settings.grep?.test("Web template @web")).toBe(false);
  expect(settings.grep?.test("Desktop template @desktop")).toBe(true);
});
it("makes trace recording explicit locally and uses the first retry on CI", () => {
  expect(browserTestSettings({}).trace).toBe("off");
  expect(browserTestSettings({ CI: "true" }).trace).toBe("on-first-retry");
  expect(browserTestSettings({}).screenshots).toBe(false);
  const task = prepareBrowserTask("e2e:visual", ["--", "--trace", "on"], {});
  expect(task.args).toEqual(["--", "--trace", "on"]);
  expect(browserTestSettings(task.env).screenshots).toBe(true);
});
it("rejects conflicting surfaces, malformed patterns and alternate live configs", () => {
  expect(() => planBrowserTests(["--web", "--desktop"])).toThrow("either");
  expect(() => prepareBrowserTask("e2e", ["--", "--grep"], {})).toThrow("regular expression");
  expect(() => prepareBrowserTask("e2e", ["--", "--grep", "["], {})).toThrow(SyntaxError);
  expect(() => prepareBrowserTask("e2e", ["--", "--config", "live.ts"], {})).toThrow("separately");
  expect(() => browserTestSettings({ RAYPX_E2E_SURFACE: "unknown" })).toThrow("surface");
});
