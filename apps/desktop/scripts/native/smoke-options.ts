const phases = new Set(["shell", "restore", "write", "read", "beta", "beta-restore"]);

/** Resolve presentation before launching a native process, including restore phases. */
export function nativeSmokeOptions(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
) {
  const positionals = args.filter((value) => value !== "--interactive");
  const phase = positionals[0] ?? environment.RAYPX_NATIVE_SMOKE_PHASE ?? "shell";
  if (positionals.length > 1 || !phases.has(phase))
    throw new Error("Use a native smoke phase and optional --interactive");
  const ui = args.includes("--interactive")
    ? "interactive"
    : (environment.RAYPX_NATIVE_SMOKE_UI ?? "quiet");
  if (ui !== "quiet" && ui !== "interactive")
    throw new Error("RAYPX_NATIVE_SMOKE_UI must be quiet or interactive");
  return { phase, ui };
}
