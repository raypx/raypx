import { expect, it } from "vite-plus/test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { CONNECTION_KEY, DEFAULT_CONNECTION } from "../../config";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import {
  DEFAULT_CONFIG,
  loadDesktopConfig,
  parseDesktopConfig,
  scopeLocalAccount,
} from "../../native/config";

it("creates a private user TOML file once, with production defaults, and preserves edits", () => {
  const dir = mkdtempSync(join(tmpdir(), "raypx-config-"));
  try {
    const first = loadDesktopConfig(dir);
    expect(first.connection).toEqual(DEFAULT_CONNECTION);
    expect(readFileSync(first.file, "utf8")).toBe(DEFAULT_CONFIG);
    const custom =
      'base_url = "https://self.example.test/"\nweb_url = "https://account.example.test"\n';
    writeFileSync(first.file, custom);
    expect(loadDesktopConfig(dir).connection).toEqual({
      apiUrl: "https://self.example.test",
      webUrl: "https://account.example.test",
    });
    expect(readFileSync(first.file, "utf8")).toBe(custom);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it.skipIf(process.platform === "win32")("restricts a newly created config to its owner", () => {
  const dir = mkdtempSync(join(tmpdir(), "raypx-private-config-"));
  try {
    const config = loadDesktopConfig(join(dir, ".raypx"));
    expect(statSync(join(dir, ".raypx")).mode & 0o777).toBe(0o700);
    expect(statSync(config.file).mode & 0o777).toBe(0o600);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("resolves named profiles and keeps account links on the selected deployment", () => {
  expect(parseDesktopConfig('base_url = "https://self.example.test"')).toEqual({
    apiUrl: "https://self.example.test",
    webUrl: "https://self.example.test",
  });
  expect(
    parseDesktopConfig(`
base_url = "https://production.example.test"
web_url = "https://production-web.example.test"
profile = "own"
[profiles.own]
base_url = "https://own-api.example.test"
`),
  ).toEqual({ apiUrl: "https://own-api.example.test", webUrl: "https://own-api.example.test" });
  expect(
    parseDesktopConfig(`
base_url = "https://api.example.test"
profile = "own"
[profiles.own]
web_url = "https://web.example.test"
`),
  ).toEqual({ apiUrl: "https://api.example.test", webUrl: "https://web.example.test" });
});

it("keeps CLI AI settings separate from the selected account server", () => {
  expect(
    parseDesktopConfig(`
base_url = "https://self.example.test"
[ai]
provider = "anthropic"
model = "configured-model"
api_key_env = "RAYPX_AI_API_KEY"
`),
  ).toEqual({ apiUrl: "https://self.example.test", webUrl: "https://self.example.test" });
  expect(() => parseDesktopConfig("ai = 42")).toThrow("ai must be a table");
});

it("fails closed on invalid or misspelled config without overwriting it or echoing secrets", () => {
  const dir = mkdtempSync(join(tmpdir(), "raypx-config-invalid-"));
  try {
    const file = join(dir, "config.toml");
    for (const source of [
      'base_url = "https://user:private-password@example.test"',
      'base_url = "https://example.test/path"',
      'base_url = "http://external.example.test"',
      'base_url = "https://example.test/?key=private-password"',
      'base_url = "https://example.test/#fragment"',
      'base_url = "file:///etc/passwd"',
      'base_url = "https:example.test"',
      "base_url = 42",
      'base_ur1 = "https://typo.example.test"',
      'profile = "missing"',
      "profiles = []",
      '[profiles.bad]\napi_key = "private-password"',
      'base_url = "unterminated-private-password',
      " ".repeat(16 * 1024 + 1),
    ]) {
      writeFileSync(file, source);
      let error: unknown;
      try {
        loadDesktopConfig(dir);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(file);
      expect((error as Error).message).not.toContain("private-password");
      expect(readFileSync(file, "utf8")).toBe(source);
    }
    expect(() => loadDesktopConfig("relative/config")).toThrow("absolute");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("isolates cookies, remote binding paths and local account namespaces by normalized API origin", () => {
  const dir = mkdtempSync(join(tmpdir(), "raypx-config-scope-"));
  try {
    const file = join(dir, "config.toml");
    writeFileSync(file, 'base_url = "http://127.0.0.1:3002"');
    const first = loadDesktopConfig(dir);
    writeFileSync(file, 'base_url = "http://127.0.0.1:3003"');
    const second = loadDesktopConfig(dir);
    expect(first.partition).not.toBe(second.partition);
    expect(first.scope).not.toBe(second.scope);
    const input = { accountId: "same-user-id", limit: 50 };
    expect(scopeLocalAccount(first.scope, input)).not.toEqual(
      scopeLocalAccount(second.scope, input),
    );
    writeFileSync(file, 'base_url = "http://127.0.0.1:3002/"');
    const restored = loadDesktopConfig(dir);
    expect(restored.partition).toBe(first.partition);
    expect(scopeLocalAccount(restored.scope, input)).toEqual(scopeLocalAccount(first.scope, input));
    expect(input.accountId).toBe("same-user-id");
    expect(scopeLocalAccount(first.scope, { accountId: 42 })).toEqual({ accountId: 42 });
    const deviceInput = { accountId: LOCAL_WORKSPACE_ID, limit: 50 };
    expect(scopeLocalAccount(first.scope, deviceInput)).toEqual(deviceInput);
    expect(scopeLocalAccount(second.scope, deviceInput)).toEqual(deviceInput);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("injects the same immutable runtime origins before renderer authentication starts", () => {
  const dir = mkdtempSync(join(tmpdir(), "raypx-config-preload-"));
  try {
    writeFileSync(
      join(dir, "config.toml"),
      'base_url = "https://api.example.test"\nweb_url = "https://web.example.test"',
    );
    const config = loadDesktopConfig(dir);
    const window: Record<string, unknown> = {};
    runInNewContext(config.preload, { window });
    expect(window[CONNECTION_KEY]).toEqual(config.connection);
    expect(Object.isFrozen(window[CONNECTION_KEY])).toBe(true);
    expect(Reflect.set(window, CONNECTION_KEY, DEFAULT_CONNECTION)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("accepts explicit connector paths without changing the selected server", () => {
  expect(
    parseDesktopConfig('[connectors]\nclaude_config_dir="/tmp/claude"\ncodex_home="/tmp/codex"'),
  ).toEqual(DEFAULT_CONNECTION);
  expect(() => parseDesktopConfig('[connectors]\ncodex_home="relative"')).toThrow("absolute");
});
