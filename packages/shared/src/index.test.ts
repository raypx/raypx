import { describe, expect, it, vi } from "vite-plus/test";

import { defaultClock, defaultIdGenerator, DomainError } from "./index.js";

describe("shared primitives", () => {
  it("preserves domain error codes and interpolation values", () => {
    const error = new DomainError("BAD_REQUEST", "Invalid input", { field: "name" });

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("BAD_REQUEST");
    expect(error.values).toEqual({ field: "name" });
    expect(error.name).toBe("DomainError");
  });

  it("keeps the default clock injectable and IDs stable in shape", () => {
    const now = new Date("2026-09-21T00:00:00.000Z");
    const nowSpy = vi.spyOn(defaultClock, "now").mockReturnValue(now);

    expect(defaultClock.now()).toBe(now);
    expect(defaultIdGenerator.next()).toMatch(/^evt_[a-z0-9]+_[a-z0-9]+$/);

    nowSpy.mockRestore();
  });
});

describe("public exports", () => {
  const publicEntries = [
    "@raypx/shared",
    "@raypx/shared/auth",
    "@raypx/shared/cache",
    "@raypx/shared/cache/env",
    "@raypx/shared/logger",
    "@raypx/shared/logger/client",
    "@raypx/shared/logger/env",
    "@raypx/shared/logger/hono",
    "@raypx/shared/logger/orpc",
    "@raypx/shared/logger/vite",
  ] as const;

  it.each(publicEntries)("loads %s from the built package", async (entry) => {
    await expect(import(entry)).resolves.toBeDefined();
  });
});
