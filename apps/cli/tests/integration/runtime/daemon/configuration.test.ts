import { expect, it } from "vite-plus/test";
import { connectorCommand, planConnectorSettings } from "../../../../src/runtime/daemon/connectors";
import { serviceDefinition } from "../../../../src/runtime/daemon/service";
import { profilePath } from "../../../../src/runtime/state";
import { dirname, join } from "node:path";
import { mkdtempSync, mkdirSync, realpathSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { terminalProjectPaths } from "../../../../src/runtime/daemon/control";

it.skipIf(process.platform === "win32")(
  "ignores missing projects and refuses a replacement symlink",
  () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "raypx-terminal-projects-")));
    const valid = join(directory, "valid"),
      replaced = join(directory, "replaced");
    mkdirSync(valid);
    symlinkSync(valid, replaced, "dir");
    try {
      const paths = terminalProjectPaths([
        { id: "valid", path: valid },
        { id: "missing", path: join(directory, "missing") },
        { id: "replaced", path: replaced },
      ]);
      expect([...paths.entries()]).toEqual([[valid, "valid"]]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

it("rejects a second profile's global hook and preserves unrelated handlers", () => {
  const first = connectorCommand("/tmp/state/profiles/first", "codex");
  const next = connectorCommand("/tmp/state/profiles/second", "codex");
  const installed = planConnectorSettings(
    "codex",
    '{"env":{"USER_VALUE":"kept"}}',
    first,
    "install",
  );
  expect(() => planConnectorSettings("codex", installed.after, next, "install")).toThrow(
    /other Raypx profile/,
  );
  expect(planConnectorSettings("codex", installed.after, next, "uninstall").after).toBe(
    installed.after,
  );
  expect(planConnectorSettings("codex", installed.after, first, "uninstall").after).toContain(
    "USER_VALUE",
  );
});
it("writes absolute, escaped launchd arguments for relative profile storage", () => {
  const options = { dataDir: "./state & data", profile: "test" };
  const definition = serviceDefinition(options, "/tmp/bin & name/raypx", "/tmp/test-home");
  expect(definition.plist).toContain("/tmp/bin &amp; name/raypx");
  expect(definition.plist).toContain(
    dirname(dirname(profilePath(options))).replaceAll("&", "&amp;"),
  );
  expect(definition.plist).not.toContain("<string>./state");
});
