import { BrowserLanguageProvider } from "../i18n.js";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers
import type {} from "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, vi } from "vitest";
export const language = (children: React.ReactNode) => (
  <BrowserLanguageProvider>{children}</BrowserLanguageProvider>
);

export function setupMemoryClientTests() {
  expect.extend(matchers);
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("raypx_locale", "en");
    const style = window.document.createElement("style");
    style.dataset.memoryMotion = "true";
    style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
    window.document.head.append(style);
  });
  afterEach(() => {
    cleanup();
    window.document.querySelector("[data-memory-motion]")?.remove();
    vi.restoreAllMocks();
  });
}
