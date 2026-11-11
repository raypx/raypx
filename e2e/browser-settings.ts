export function browserTestSettings(
  environment: Record<string, string | undefined>,
  capacity: { cpus: number; memoryBytes: number },
) {
  const surface = environment.RAYPX_E2E_SURFACE ?? "all";
  if (!["all", "web", "desktop"].includes(surface)) throw new Error("Invalid E2E surface");
  const clauses = [
    ...(environment.RAYPX_E2E_SMOKE === "1" ? ["@smoke\\b"] : []),
    ...(environment.RAYPX_E2E_GREP ? [environment.RAYPX_E2E_GREP] : []),
  ];
  const { cpus, memoryBytes } = capacity;
  let workers = Math.max(1, Math.min(2, cpus));
  if (environment.CI) workers = 2;
  else if (cpus >= 12 && memoryBytes >= 32 * 2 ** 30) workers = 8;
  else if (cpus >= 8 && memoryBytes >= 16 * 2 ** 30) workers = 4;

  return {
    surface,
    grep: clauses.length
      ? new RegExp(clauses.map((pattern) => `(?=.*(?:${pattern}))`).join("") + ".*")
      : undefined,
    trace: environment.CI ? ("on-first-retry" as const) : ("off" as const),
    workers,
  };
}
