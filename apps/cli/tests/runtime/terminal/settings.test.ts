import { expect, it } from "vite-plus/test";
import { chmod, lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyHookSettings, planHookSettings } from "../../../src/runtime/terminal/settings";

const command = "'/installed/raypx' terminal hook codex";
it.skipIf(process.platform === "win32")(
  "preserves file mode, indentation and newlines and gives a dotfiles-specific error",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "raypx-dotfiles-")),
      file = join(directory, "settings.json"),
      link = join(directory, "linked.json");
    const text = '{\r\n\t"theme": "dark"\r\n}\r\n';
    try {
      await writeFile(file, text);
      await chmod(file, 0o640);
      const plan = planHookSettings("claude", text, command, "install");
      await applyHookSettings(file, plan);
      expect((await lstat(file)).mode & 0o777).toBe(0o640);
      expect(await readFile(file, "utf8")).toContain('\r\n\t"hooks":');
      await symlink(file, link);
      await expect(
        applyHookSettings(link, planHookSettings("claude", plan.after, command, "uninstall")),
      ).rejects.toMatchObject({ code: "HOOK_SETTINGS_SYMLINK" });
      expect((await lstat(link)).isSymbolicLink()).toBe(true);
      expect(await readFile(file, "utf8")).toBe(plan.after);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
it.each(["claude", "codex"] as const)(
  "preserves %s settings and hooks, installs idempotently and removes only owned handlers",
  (provider) => {
    const original = {
      permissions: { deny: ["Bash(rm *)"] },
      mcpServers: { local: {} },
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "keep-me" }] }],
        PermissionRequest: [
          { matcher: "Bash", hooks: [{ type: "command", command: "another-hook" }] },
        ],
      },
    };
    const install = planHookSettings(provider, JSON.stringify(original), command, "install");
    const next = JSON.parse(install.after);
    expect(next.permissions).toEqual(original.permissions);
    expect(next.mcpServers).toEqual(original.mcpServers);
    expect(next.hooks.Stop).toEqual(original.hooks.Stop);
    expect(planHookSettings(provider, install.after, command, "install").changed).toBe(false);
    next.userAddedAfterInstall = true;
    const uninstall = planHookSettings(provider, JSON.stringify(next), command, "uninstall");
    expect(JSON.parse(uninstall.after)).toEqual({ ...original, userAddedAfterInstall: true });
    expect(install.requiresTrust).toBe(provider === "codex");
  },
);
it("does not rewrite JSONC or remove a user-edited handler", () => {
  expect(() => planHookSettings("claude", "{ // comments\n}", command, "install")).toThrow(
    /strict JSON/,
  );
  const initial = planHookSettings("claude", null, command, "install");
  const edited = JSON.parse(initial.after);
  edited.hooks.PermissionRequest[0].hooks[0].timeout = 700;
  const source = JSON.stringify(edited);
  expect(() => planHookSettings("claude", source, command, "install")).toThrow(/edited/);
  expect(planHookSettings("claude", source, command, "uninstall")).toMatchObject({
    changed: false,
    preservedModified: true,
    after: source,
  });
});
it("backs up exactly and rejects a plan made before a concurrent edit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "raypx-hook-settings-")),
    file = join(dir, "settings.json");
  try {
    const source = '{"theme":"dark"}\n';
    await writeFile(file, source);
    const plan = planHookSettings("claude", source, command, "install");
    await writeFile(file, '{"theme":"light"}');
    await expect(applyHookSettings(file, plan)).rejects.toThrow(/changed/);
    await writeFile(file, source);
    const result = await applyHookSettings(file, plan);
    expect(await readFile(result.backup!, "utf8")).toBe(source);
    expect(await readFile(file, "utf8")).toBe(plan.after);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
