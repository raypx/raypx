import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vite-plus/test";
import { terminalCommand } from "./shell.js";

const input = { args: [], cwd: "/work", timeoutMs: 86_400_000 };
it("keeps explicit terminal executables, arguments, cwd and timeout unchanged", async () => {
  const command = { ...input, executable: "/custom/shell", args: ["--interactive"] };
  const available = vi.fn();
  expect(await terminalCommand(command, {}, "darwin", available)).toEqual(command);
  expect(available).not.toHaveBeenCalled();
});
it("uses only available absolute host shell paths and falls back without a PATH lookup", async () => {
  const available = vi.fn(async (path: string) => path === "/bin/sh");
  expect(await terminalCommand(input, { SHELL: "custom-shell" }, "linux", available)).toEqual({
    ...input,
    executable: "/bin/sh",
  });
  expect(available.mock.calls).toEqual([["/bin/sh", "linux"]]);
  available.mockClear();
  await terminalCommand(input, { SHELL: "/missing/shell" }, "darwin", available);
  expect(available.mock.calls).toEqual([
    ["/missing/shell", "darwin"],
    ["/bin/sh", "darwin"],
  ]);
});
it("resolves Windows ComSpec and verified SystemRoot fallback on the host", async () => {
  const preferred = "D:\\Shells\\cmd.exe";
  const available = vi.fn(async (path: string) => path === preferred);
  expect(
    (await terminalCommand(input, { ComSpec: preferred }, "win32", available)).executable,
  ).toBe(preferred);
  available.mockImplementation(async (path: string) => path === "D:\\Windows\\System32\\cmd.exe");
  expect(
    (
      await terminalCommand(
        input,
        { ComSpec: "cmd.exe", SystemRoot: "D:\\Windows" },
        "win32",
        available,
      )
    ).executable,
  ).toBe("D:\\Windows\\System32\\cmd.exe");
  expect(available.mock.calls.some(([path]) => path === "cmd.exe")).toBe(false);
});
it("rejects a missing shell with a bounded error and never echoes environment content", async () => {
  await expect(
    terminalCommand(input, { SHELL: "/private/shell" }, "linux", async () => false),
  ).rejects.toMatchObject({
    code: "DEFAULT_SHELL_UNAVAILABLE",
    message: "No system shell is available",
  });
});
it.skipIf(process.platform === "win32")(
  "checks real executable permission and excludes directories",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "raypx-shell-"));
    try {
      const shell = join(directory, "shell");
      await writeFile(shell, "#!/bin/sh\n");
      await chmod(shell, 0o600);
      expect((await terminalCommand(input, { SHELL: shell })).executable).toBe("/bin/sh");
      await chmod(shell, 0o700);
      expect((await terminalCommand(input, { SHELL: shell })).executable).toBe(shell);
      expect((await terminalCommand(input, { SHELL: directory })).executable).toBe("/bin/sh");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
