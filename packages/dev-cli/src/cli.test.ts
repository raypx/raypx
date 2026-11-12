import { afterEach, expect, it, vi } from "vitest";
import { helpText, main, runCli } from "./cli.js";

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
});

function capture() {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  return { log, error };
}

it("lists public commands only", () => {
  const help = helpText();
  for (const name of ["tasks", "test", "verify", "policy", "doctor", "workspace list"])
    expect(help).toContain(name);
  for (const name of ["ci:plan", "ci:gate", "cli:experiment"]) expect(help).not.toContain(name);
});

it("prints help without a command and per-command usage for owned commands", async () => {
  const { log } = capture();
  await main([]);
  expect(log.mock.calls[0]?.[0]).toBe(helpText());
  await main(["policy", "--help"]);
  expect(log.mock.calls[1]?.[0]).toContain("Usage: raypx-dev policy");
});

it.each([
  [["package-test", "postgres"], "Unknown command: package-test"],
  [["knip"], "Unknown command: knip"],
  [["test:inventory"], "Unknown command: test:inventory"],
  [["policy", "extra"], "Usage: raypx-dev policy"],
  [["workspace", "new", "kit", "--unknown"], "Unknown option '--unknown'"],
  [["workspace", "new", "kit", "--kind"], "Option '--kind <value>' argument missing"],
  [["workspace", "new", "kit", "--kind", "service"], "Unknown kind service"],
  [["workspace", "new", "kit", "--target", "moon"], "Unknown target moon"],
  [["workspace", "remove"], "Usage: raypx-dev workspace"],
  [["env"], "Usage: raypx-dev env -- <external command>"],
  [["analytics", "upload"], "Usage: raypx-dev analytics sourcemaps"],
])("rejects %j", async (args, message) => {
  await expect(main(args)).rejects.toThrow(message);
});

it("prints only the message unless RAYPX_DEBUG requests the stack", async () => {
  const { error } = capture();
  await runCli(["knip"]);
  expect(process.exitCode).toBe(1);
  expect(error.mock.calls[0]?.[0]).toMatch(/^Unknown command: knip/);
  expect(error.mock.calls[0]?.[0]).not.toContain("    at ");
  vi.stubEnv("RAYPX_DEBUG", "1");
  await runCli(["knip"]);
  expect(error.mock.calls[1]?.[0]).toContain("    at ");
});
