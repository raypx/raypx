import { bench, webview } from "@hona/strobe";
import { recordOwnership, teardown } from "./fixture";
import {
  prepareConversation,
  closeConversation,
  openConversation,
  resetConversation,
} from "./conversation";
const seed = process.env.RAYPX_STROBE_SEED_HOME;
if (!seed) throw new Error("Run through the Desktop perf task to prepare synthetic enrollment");
export default bench({
  targets: {
    webview: webview("raypx-head", {
      home: seed,
      viewport: { width: 1280, height: 800 },
      gpuCache: "warm",
    }),
  },
  setup: async (ctx) => {
    await prepareConversation(ctx);
    await recordOwnership(ctx);
  },
  teardown: async (ctx) => {
    try {
      await teardown(ctx);
    } finally {
      await closeConversation(ctx);
    }
  },
  cases: {
    "conversation-scroll": {
      primary: "cpu.work",
      run: async ({ page }) => {
        await page.scroll("[data-conversation]", { by: -2000 });
        await page.scroll("[data-conversation]", { by: 2000 });
      },
      reset: openConversation,
    },
    "conversation-input": {
      primary: "run.duration",
      run: async ({ page }) => {
        await page.click("textarea:not([required])");
        await page.type("textarea:not([required])", "Synthetic unsent instruction 中文");
      },
      reset: openConversation,
    },
    "conversation-stream": {
      primary: "cpu.work",
      run: async ({ page }) => {
        await page.click("textarea:not([required])");
        await page.type("textarea:not([required])", "Synthetic follow-up");
        await page.click("form:has(textarea:not([required])) button[type='submit']");
        await page.wait(2500);
      },
      reset: resetConversation,
    },
  },
});
