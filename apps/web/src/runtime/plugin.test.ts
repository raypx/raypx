import { afterEach, expect, it, vi } from "vitest";
vi.mock("nitro", () => ({ definePlugin: (value: unknown) => value }));
import plugin from "./plugin.js";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("fails Web startup on retired inputs, including empty values, before serving", () => {
  vi.stubEnv("VITE_API_URL", "");
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("startup exited");
  });
  expect(() => plugin({} as never)).toThrow("startup exited");
  expect(output).toHaveBeenCalledExactlyOnceWith(
    expect.stringMatching(/VITE_API_URL.*API_PUBLIC_URL/),
  );
});
