type Variant = { role?: string; process_set?: { by_program?: Record<string, number> } };
/** --check has no variants in Strobe 0.13.0; verify accounting in the timed A/A and A/B results. */
export function processAccounting(data: { kind?: string; variants?: Variant[] }, daemon: boolean) {
  if (data.kind === "check")
    return {
      status: "deferred",
      issues: [] as string[],
      reason: "Check schema has no process set",
    };
  const issues: string[] = [];
  for (const variant of data.variants ?? []) {
    const programs = variant.process_set?.by_program ?? {};
    const names = Object.keys(programs);
    if (!names.some((name) => /^raypx(?:-desktop)?(?:\.exe)?$/i.test(name)))
      issues.push(`${variant.role}: host absent from measured process set`);
    const count = Object.entries(programs).reduce(
      (total, [name, amount]) =>
        total + (/^raypx(?:-desktop)?(?:\.exe)?$/i.test(name) ? amount : 0),
      0,
    );
    if (daemon && count < 2)
      issues.push(`${variant.role}: owned daemon absent from measured process set`);
    if (!names.some((name) => /webkit|webview2/i.test(name)))
      issues.push(`${variant.role}: WebView/XPC attribution unavailable`);
  }
  if (!data.variants?.length) issues.push("Strobe did not export process attribution");
  return { status: issues.length ? "uncertain" : "verified", issues };
}
