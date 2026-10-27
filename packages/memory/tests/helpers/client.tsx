import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers
import type {} from "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import type { ContextDocument, ContextVersion } from "../../src/index.js";
import type { MemoryClientPort } from "../../src/client.js";

export const deviceId = "11111111-1111-4111-8111-111111111111",
  projectId = "22222222-2222-4222-8222-222222222222",
  id = "33333333-3333-4333-8333-333333333333";
export function document(revision = 2, name = "Project conventions"): ContextDocument {
  return {
    id,
    kind: "memory",
    name,
    category: "Engineering",
    content: `Reference revision ${revision}`,
    project: null,
    revision,
    archived: false,
    createdAt: "2026-10-26T00:00:00Z",
    updatedAt: "2026-10-26T00:00:00Z",
  };
}
export function version(revision: number): ContextVersion {
  return { ...document(revision), reason: "updated" };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
export function fixture() {
  const client = {
    list: vi.fn<MemoryClientPort["list"]>(async () => [document()]),
    delete: vi.fn<MemoryClientPort["delete"]>(async () => ({ deleted: true })),
    get: vi.fn<MemoryClientPort["get"]>(async () => document()),
    create: vi.fn<MemoryClientPort["create"]>(async (input) => ({
      ...document(),
      ...input.document,
    })),
    update: vi.fn<MemoryClientPort["update"]>(async (input) => ({
      ...document(input.revision + 1),
      ...input.document,
    })),
    archive: vi.fn<MemoryClientPort["archive"]>(async (input) => ({
      ...document(input.revision + 1),
      archived: input.archived,
    })),
    history: vi.fn<MemoryClientPort["history"]>(async () => [version(2), version(1)]),
    restore: vi.fn<MemoryClientPort["restore"]>(async (input) => document(input.revision + 1)),
    resolve: vi.fn<MemoryClientPort["resolve"]>(async () => ({
      capturedAt: "2026-10-26T00:00:00Z",
      sources: [],
    })),
  };
  return client;
}
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
