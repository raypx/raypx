import { isAbsolute } from "node:path";

/** Preserve Strobe ownership and required OS variables while removing user configuration. */
export function performanceEnvironment(
  source: NodeJS.ProcessEnv,
  home?: string,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (
      value === undefined ||
      /^(?:RAYPX_(?!STROBE_)|ANTHROPIC_|OPENAI_|GOOGLE_|GEMINI_|OPENROUTER_|AWS_|AZURE_|OTEL_|POSTHOG_|SENTRY_|BUN_INSPECT|WEBVIEW2_|CLAUDE_|CODEX_|(?:HTTP|HTTPS|ALL|NO)_PROXY$)/i.test(
        key,
      ) ||
      /(?:API_KEY|ACCESS_TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key)
    )
      continue;
    env[key] = value;
  }
  Object.assign(env, {
    DO_NOT_TRACK: "1",
    HTTP_PROXY: "http://127.0.0.1:9",
    HTTPS_PROXY: "http://127.0.0.1:9",
    NO_PROXY: "localhost,127.0.0.1,::1",
  });
  if (home) {
    if (!isAbsolute(home)) throw new Error("Performance home must be absolute");
    Object.assign(env, {
      HOME: home,
      USERPROFILE: home,
      APPDATA: home + "/AppData/Roaming",
      LOCALAPPDATA: home + "/AppData/Local",
      XDG_DATA_HOME: home + "/.local/share",
      XDG_CONFIG_HOME: home + "/.config",
      XDG_CACHE_HOME: home + "/.cache",
      RAYPX_HOME: home + "/raypx-config",
      RAYPX_DESKTOP_DATA_DIR: home + "/raypx-desktop",
    });
  }
  return env;
}
export function commandQuote(value: string) {
  if (/[\r\n\0]/.test(value)) throw new Error("Invalid executable path");
  return process.platform === "win32"
    ? '"' + value.replaceAll('"', "") + '"'
    : "'" + value.replaceAll("'", "'\\''") + "'";
}

/** A/A must use head for both roles, including benches that select a command from their environment. */
export function comparisonEnvironment(source: Record<string, string>, stage: string) {
  const env = { ...source };
  if (stage === "aa" || stage === "check")
    for (const [base, head] of [
      ["RAYPX_STROBE_CLI_BASE", "RAYPX_STROBE_CLI_HEAD"],
      ["RAYPX_STROBE_BASE_EXE", "RAYPX_STROBE_HEAD_EXE"],
      ["RAYPX_STROBE_BASE_URL", "RAYPX_STROBE_HEAD_URL"],
      ["RAYPX_STROBE_BASE_SPA", "RAYPX_STROBE_HEAD_SPA"],
    ] as const)
      if (env[head]) env[base] = env[head];
  return env;
}
