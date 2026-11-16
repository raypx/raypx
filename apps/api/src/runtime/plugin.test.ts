import { afterEach, expect, it, vi } from "vitest";
import { getServerRole } from "../env.js";
import { getBackendRuntime } from "./backend.js";
import plugin from "./plugin.js";

vi.mock("nitro", () => ({ definePlugin: (value: unknown) => value }));
vi.mock("./backend.js", () => ({ getBackendRuntime: vi.fn(), closeBackendRuntime: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

it.each([
  ["AUTH_URL", "PUBLIC_URL"],
  ["ALLOWED_ORIGINS", "EXTRA_ALLOWED_ORIGINS"],
])(
  "prints the safe %s replacement and exits before starting any backend role",
  async (key, replacement) => {
    let failure: unknown;
    try {
      getServerRole({ SERVER_ROLE: "relay", [key]: "https://private:credential@old.example.test" });
    } catch (error) {
      failure = error;
    }
    vi.mocked(getBackendRuntime).mockRejectedValueOnce(failure);
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("startup exited");
    });
    await expect(plugin({} as never)).rejects.toThrow("startup exited");
    expect(exit).toHaveBeenCalledWith(1);
    expect(output).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(replacement));
    expect(output).toHaveBeenCalledWith(expect.stringContaining(key));
    expect(output.mock.calls.flat().join(" ")).not.toContain("credential");
  },
);

it("keeps unrelated startup failures sanitized", async () => {
  vi.mocked(getBackendRuntime).mockRejectedValueOnce(new Error("private backend diagnostic"));
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("startup exited");
  });
  await expect(plugin({} as never)).rejects.toThrow("startup exited");
  expect(output).toHaveBeenCalledExactlyOnceWith(
    "Backend startup failed. Check runtime role, configuration, database availability and migrations.",
  );
});
