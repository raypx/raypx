// Load matcher types without registering against jest-dom's separate Vitest runtime.
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers
import type {} from "@testing-library/jest-dom/vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";
import { afterEach, expect, vi } from "vitest";

// Keep matcher registration on the expect instance used by the actual runner.
expect.extend(matchers);
const motion = document.createElement("style");
motion.textContent =
  "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}";
document.head.append(motion);
afterEach(cleanup);

vi.mock("../src/origins.js", () => ({
  webOrigins: () => ({
    webOrigin: "https://raypx.example",
    apiOrigin: "https://api.raypx.example",
    apiBaseUrl: "https://api.raypx.example",
  }),
  apiOrigin: () => "https://api.raypx.example",
  webOrigin: () => "https://raypx.example",
  apiFetch: fetch,
}));
