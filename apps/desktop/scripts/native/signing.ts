const credentials = [
  "APPLE_CERTIFICATE",
  "APPLE_CERTIFICATE_PASSWORD",
  "APPLE_SIGNING_IDENTITY",
  "APPLE_ID",
  "APPLE_PASSWORD",
  "APPLE_TEAM_ID",
  "RAYPX_NOTARY_PROFILE",
  "WINDOWS_CERTIFICATE",
  "WINDOWS_CERTIFICATE_PASSWORD",
  "RAYPX_DESKTOP_SIGNING_THUMBPRINT",
  "MYGO_WINDOWS_CERTIFICATE_PASSWORD",
  "MYGO_UPDATER_PRIVATE_KEY",
  "RAYPX_MYGO_UPDATER_PUBLIC_KEY",
  "RAYPX_MYGO_UPDATER_URL",
] as const;

/** Test packages must never import distribution credentials or enable updates. */
export function signingEnvironment(
  source: Readonly<Record<string, string | undefined>>,
  options: { smoke?: boolean } = {},
): NodeJS.ProcessEnv {
  const env = { ...source };
  for (const name of credentials) if (options.smoke || !env[name]) delete env[name];
  return env;
}
