import { bench, native, webview } from "@hona/strobe";
import { teardown, recordOwnership } from "./fixture";
const selector = process.env.RAYPX_STROBE_READY_SELECTOR;
const seed = process.env.RAYPX_STROBE_SEED_HOME;
if (!seed) throw new Error("Run through the Desktop perf task to prepare a synthetic enrollment");
export default bench({
  targets: {
    native: native("raypx-head", {
      home: seed,
      viewport: { width: 1280, height: 800 },
      gpuCache: "warm",
      ui: { workbench: selector ?? "unverified-workbench" },
    }),
    webview: webview("raypx-head", {
      home: seed,
      viewport: { width: 1280, height: 800 },
      gpuCache: "warm",
      ui: { workbench: "[data-raypx-workbench-ready='true']" },
    }),
  },
  setup: async (ctx) => {
    await ctx.page.waitFor("@workbench", { timeout: 90_000 });
    await ctx.page.wait(1000);
    await recordOwnership(ctx);
  },
  teardown,
  cases: {
    "idle-five-seconds": {
      primary: "cpu.app.total",
      metrics: ["memory.app.private"],
      unsupported: selector
        ? {}
        : {
            native:
              "Workbench accessibility selector has not been verified; window visibility cannot establish readiness",
          },
      run: async (ctx) => {
        await ctx.page.wait(5000);
      },
    },
  },
});
