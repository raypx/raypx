import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import {
  CONNECTION_KEY,
  DEFAULT_CONNECTION,
  parseServerOrigin,
  type DesktopConnection,
} from "../config";

export const DEFAULT_CONFIG = `# Raypx reads this file on startup. Restart after editing.
# One installation can connect to any Raypx deployment.
base_url = "${DEFAULT_CONNECTION.apiUrl}"
# web_url = "https://raypx.pro" # Only needed when Web and API use different origins.
# profile = "beta"            # Select a named profile; omit for the defaults above.

[profiles.beta]
base_url = "https://beta.raypx.pro"

# [profiles.self_hosted]
# base_url = "https://raypx.example.com"
`;

function table(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date),
  );
}
const profileName = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
function endpoints(value: Record<string, unknown>): Partial<DesktopConnection> {
  const apiUrl = value.base_url === undefined ? undefined : parseServerOrigin(value.base_url);
  const webUrl = value.web_url === undefined ? undefined : parseServerOrigin(value.web_url);
  return {
    ...(apiUrl === undefined ? {} : { apiUrl }),
    ...(webUrl === undefined ? {} : { webUrl }),
  };
}

export function parseDesktopConfig(source: string): DesktopConnection {
  if (Buffer.byteLength(source) > 16 * 1024) throw new Error("Configuration exceeds 16 KiB");
  let value: unknown;
  try {
    value = Bun.TOML.parse(source);
  } catch {
    // Parser diagnostics can quote file contents. Keep secrets out of errors/logs.
    throw new Error("Invalid TOML syntax");
  }
  if (
    !table(value) ||
    Object.keys(value).some(
      (key) => !["base_url", "web_url", "profile", "profiles", "ai", "connectors"].includes(key),
    )
  )
    throw new Error(
      "Unknown configuration option; use base_url, web_url, profile, profiles, ai or connectors",
    );
  // CLI owns model configuration. It does not select the Desktop account server.
  if (value.ai !== undefined && !table(value.ai)) throw new Error("ai must be a table");
  if (
    value.connectors !== undefined &&
    (!table(value.connectors) ||
      Object.entries(value.connectors).some(
        ([key, path]) =>
          !["claude_config_dir", "codex_home"].includes(key) ||
          typeof path !== "string" ||
          !isAbsolute(path),
      ))
  )
    throw new Error("connectors supports absolute claude_config_dir and codex_home paths only");
  const defaults = endpoints(value);
  const profiles = value.profiles ?? {};
  if (!table(profiles)) throw new Error("profiles must be a table");
  const parsed = new Map<string, Partial<DesktopConnection>>();
  for (const [name, profile] of Object.entries(profiles)) {
    if (
      !profileName.test(name) ||
      !table(profile) ||
      Object.keys(profile).some((key) => !["base_url", "web_url"].includes(key))
    )
      throw new Error("Invalid profile; profiles support base_url and web_url only");
    parsed.set(name, endpoints(profile));
  }
  let selected: Partial<DesktopConnection> = {};
  if (value.profile !== undefined) {
    if (
      typeof value.profile !== "string" ||
      !profileName.test(value.profile) ||
      !parsed.has(value.profile)
    )
      throw new Error("profile must select an existing named profile");
    selected = parsed.get(value.profile)!;
  }
  const apiUrl = selected.apiUrl ?? defaults.apiUrl ?? DEFAULT_CONNECTION.apiUrl;
  // An overridden API must not send verification/reset links to an inherited server.
  const webUrl = selected.webUrl ?? (selected.apiUrl ? apiUrl : (defaults.webUrl ?? apiUrl));
  return { apiUrl, webUrl };
}

export function loadDesktopConfig(directory = process.env.RAYPX_HOME ?? join(homedir(), ".raypx")) {
  if (!isAbsolute(directory)) throw new Error("RAYPX_HOME must be an absolute directory");
  const file = join(directory, "config.toml");
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    try {
      writeFileSync(file, DEFAULT_CONFIG, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST")
        throw new Error("Unable to create config.toml", { cause: error });
    }
    const stat = statSync(file);
    if (!stat.isFile() || stat.size > 16 * 1024)
      throw new Error("config.toml must be a file of at most 16 KiB");
    const source = readFileSync(file, "utf8");
    const connection = parseDesktopConfig(source);
    const configured = (
      Bun.TOML.parse(source) as { connectors?: { claude_config_dir?: string; codex_home?: string } }
    ).connectors;
    const connectorDirectories = {
      ...(configured?.claude_config_dir ? { claude: configured.claude_config_dir } : {}),
      ...(configured?.codex_home ? { codex: configured.codex_home } : {}),
    };
    const scope = createHash("sha256").update(connection.apiUrl).digest("hex").slice(0, 32);
    return {
      file,
      connection,
      connectorDirectories,
      scope,
      partition: `persist:raypx-${scope}`,
      preload: `Object.defineProperty(window,${JSON.stringify(CONNECTION_KEY)},{value:Object.freeze(${JSON.stringify(connection)})});`,
    };
  } catch (error) {
    const reason =
      error instanceof Error && !("code" in error) ? error.message : "Unable to read config.toml";
    throw new Error(`Raypx configuration error: ${file}\n${reason}`, { cause: error });
  }
}

/** Keep same-ID accounts on separate deployments out of one another's local history. */
export function scopeLocalAccount(scope: string, params: unknown): unknown {
  if (
    !table(params) ||
    typeof params.accountId !== "string" ||
    !params.accountId ||
    params.accountId.length > 200
  )
    return params; // The CLI remains responsible for rejecting malformed protocol input.
  if (params.accountId === LOCAL_WORKSPACE_ID) return params;
  const account = createHash("sha256").update(params.accountId).digest("hex").slice(0, 32);
  return { ...params, accountId: `server:${scope}:${account}` };
}
