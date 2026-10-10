import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(join(process.cwd(), "package.json"));
const playwrightPath = require.resolve("playwright/package.json");
const corePath = createRequire(playwrightPath).resolve("playwright-core/package.json");
const playwright = JSON.parse(readFileSync(playwrightPath, "utf8"));
const core = JSON.parse(readFileSync(corePath, "utf8"));
const source = readFileSync(join(dirname(corePath), "browsers.json"), "utf8");
const metadata = JSON.parse(source);
const chromium = Array.isArray(metadata.browsers)
  ? metadata.browsers.find((browser) => browser?.name === "chromium")
  : undefined;

if (
  typeof playwright.version !== "string" ||
  !/^[0-9A-Za-z.+-]+$/.test(playwright.version) ||
  playwright.version !== core.version ||
  typeof chromium?.revision !== "string" ||
  !/^\d+$/.test(chromium.revision)
)
  throw new Error("Installed Playwright and Chromium metadata must agree before caching.");
if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required.");

const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
appendFileSync(
  process.env.GITHUB_OUTPUT,
  `version=${playwright.version}\nrevision=${chromium.revision}\nmetadata-hash=${hash}\n`,
);
console.log(`Playwright ${playwright.version}, Chromium revision ${chromium.revision}`);
