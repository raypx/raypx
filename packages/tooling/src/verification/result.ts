type Job = { result: string; outputs?: Record<string, string> };
export function assertCiResult(needs: Record<string, Job>) {
  if (needs.changes?.result !== "success") throw new Error("Change analysis did not succeed");
  const flags = needs.changes.outputs ?? {};
  if (
    ["native", "backend", "browser", "rust"].some(
      (name) => !["true", "false"].includes(flags[name] ?? ""),
    )
  )
    throw new Error("Change analysis outputs are incomplete");
  for (const [name, required] of Object.entries({
    javascript: true,
    backend: flags.backend === "true",
    browser: flags.browser === "true",
    desktop: flags.native === "true",
    libraries: flags.rust === "true",
  })) {
    const result = needs[name]?.result;
    if (required ? result !== "success" : result !== "success" && result !== "skipped")
      throw new Error(`CI gate ${name} did not complete successfully (${result ?? "missing"})`);
  }
}
if (import.meta.main) {
  assertCiResult(JSON.parse(process.env.GITHUB_NEEDS ?? "{}"));
  console.log("All required CI gates passed; unrelated gates were skipped");
}
