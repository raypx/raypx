import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";

const withTypeScriptSourceResolution = createRequire(import.meta.url)("./metro-resolver.cjs");
const root = resolve("/repository");
const originModulePath = join(root, "packages", "example", "src", "index.ts");
const target = join(root, "packages", "example", "src", "messages.ts");
const missing = Object.assign(new Error("not found"), { candidates: {} });

function context(origin = originModulePath, exists = true) {
  return { originModulePath: origin, doesFileExist: (file: string) => exists && file === target };
}

describe("Mobile NodeNext source resolution", () => {
  it("preserves successful default resolution without overriding JavaScript", () => {
    const result = { type: "sourceFile", filePath: target.replace(/\.ts$/, ".js") };
    const resolveRequest = vi.fn(() => result);
    const config = withTypeScriptSourceResolution({ resolver: { resolveRequest } }, root);
    expect(config.resolver.resolveRequest(context(), "./messages.js", "ios")).toBe(result);
    expect(resolveRequest).toHaveBeenCalledTimes(1);
  });

  it("retries an adjacent TypeScript source through the existing resolver", () => {
    const result = { type: "sourceFile", filePath: target };
    const resolveRequest = vi.fn((_context: unknown, name: string) => {
      if (name.endsWith(".js")) throw missing;
      return result;
    });
    const config = withTypeScriptSourceResolution({ resolver: { resolveRequest } }, root);
    const input = context();
    expect(config.resolver.resolveRequest(input, "./messages.js", "android")).toBe(result);
    expect(resolveRequest.mock.calls).toEqual([
      [input, "./messages.js", "android"],
      [input, "./messages", "android"],
    ]);
  });

  it.each([
    [join(root, "node_modules", "example", "index.ts"), "./messages.js", true],
    [resolve("/elsewhere/index.ts"), "./messages.js", true],
    [originModulePath, "example/messages.js", true],
    [originModulePath, "./messages.json", true],
    [originModulePath, "./messages.js", false],
  ] as const)("keeps non-workspace or missing sources unchanged: %s %s", (origin, name, exists) => {
    const resolveRequest = vi.fn(() => {
      throw missing;
    });
    const config = withTypeScriptSourceResolution({ resolver: { resolveRequest } }, root);
    expect(() => config.resolver.resolveRequest(context(origin, exists), name, "ios")).toThrow(
      missing,
    );
    expect(resolveRequest).toHaveBeenCalledTimes(1);
  });

  it("does not hide resolver configuration errors when TypeScript source exists", () => {
    const error = new Error("invalid resolver configuration");
    const resolveRequest = vi.fn(() => {
      throw error;
    });
    const config = withTypeScriptSourceResolution({ resolver: { resolveRequest } }, root);
    expect(() => config.resolver.resolveRequest(context(), "./messages.js", "ios")).toThrow(error);
    expect(resolveRequest).toHaveBeenCalledTimes(1);
  });
});
