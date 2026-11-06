import { bench, native, webview } from "@hona/strobe";
import { beforeLaunch, teardown, recordOwnership } from "./fixture";

const nativeReady = process.env.RAYPX_STROBE_READY_SELECTOR;
const workbench = "@workbench";
const unsupported = nativeReady
  ? {}
  : { native: "Workbench accessibility selector has not been verified on this platform" };
export default bench({
  targets: {
    native: native("raypx-head", {
      viewport: { width: 1280, height: 800 },
      gpuCache: "warm",
      ui: { workbench: nativeReady ?? "unverified-workbench" },
    }),
    webview: webview("raypx-head", {
      viewport: { width: 1280, height: 800 },
      gpuCache: "warm",
      ui: { workbench: "[data-raypx-workbench-ready='true']" },
    }),
  },
  setup: recordOwnership,
  teardown,
  cases: {
    "first-window": {
      primary: "launch.ready",
      targets: ["native"],
      launch: {
        until: { window: "visible" },
        timeout: 90_000,
        before: (ctx) => beforeLaunch(ctx, false),
      },
    },
    "workbench-cold-daemon": {
      primary: "launch.ready",
      targets: ["native", "webview"],
      unsupported,
      launch: { until: workbench, timeout: 90_000, before: (ctx) => beforeLaunch(ctx, true) },
    },
    "workbench-hot-daemon": {
      primary: "launch.ready",
      targets: ["native", "webview"],
      unsupported,
      launch: { until: workbench, timeout: 90_000, before: (ctx) => beforeLaunch(ctx, true, true) },
    },
  },
});
