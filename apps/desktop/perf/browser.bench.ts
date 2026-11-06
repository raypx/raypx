import { bench, url } from "@hona/strobe";
export default bench({
  targets: {
    browser: url("http://127.0.0.1:9", {
      engine: "chromium",
      viewport: { width: 1280, height: 800 },
      prepare: async (page) => {
        await page.mock("*", (request) =>
          new URL(request.url).hostname === "127.0.0.1"
            ? undefined
            : { status: 403, body: "External network disabled" },
        );
      },
    }),
  },
  setup: async ({ page }) => {
    await page.waitFor("[data-conversation]", { timeout: 90_000 });
  },
  cases: {
    "conversation-scroll": {
      primary: "cpu.work",
      run: async ({ page }) => {
        await page.scroll("[data-conversation]", { by: -2000 });
        await page.scroll("[data-conversation]", { by: 2000 });
      },
    },
    "conversation-input": {
      primary: "run.duration",
      run: async ({ page }) => {
        await page.click("textarea:not([required])");
        await page.type("textarea:not([required])", "Synthetic unsent instruction 中文");
      },
      reset: async ({ page }) => {
        await page.click("#fixture-reset");
        await page.waitFor("[data-conversation]");
      },
    },
    "conversation-stream": {
      primary: "cpu.work",
      run: async ({ page }) => {
        await page.click("#fixture-stream");
        await page.wait(2500);
      },
      reset: async ({ page }) => {
        await page.click("#fixture-reset");
        await page.waitFor("[data-conversation]");
      },
    },
  },
});
