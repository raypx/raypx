export function nativeSmokeEnvironment(source: NodeJS.ProcessEnv) {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key, value]) =>
        value !== undefined &&
        !key.startsWith("RAYPX_") &&
        !/(?:API_KEY|ACCESS_TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key),
    ),
  ) as Record<string, string>;
}
