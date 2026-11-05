import { fileURLToPath as entryFile } from "node:url";
import { resolve as entryPath } from "node:path";
import { distributionRequested } from "./events.ts";
import { ciOutputs, gateDefinitions, parseCiPlan, requiredGates } from "./gates.ts";

type Job = { result: string; outputs?: Record<string, string> };
export function assertCiResult(
  needs: Record<string, Job>,
  distribution?: boolean,
  revision?: string,
) {
  if (needs.changes?.result !== "success") throw new Error("Change analysis did not succeed");
  const flags = needs.changes.outputs ?? {};
  if (
    [...gateDefinitions.flatMap(({ flag }) => (flag ? [flag] : [])), "distribution"].some(
      (name) => !["true", "false"].includes(flags[name] ?? ""),
    )
  )
    throw new Error("Change analysis outputs are incomplete");
  if (distribution !== undefined && flags.distribution !== String(distribution))
    throw new Error("Distribution gate selection does not match the event");
  if (flags.distribution === "true" && flags.native !== "true")
    throw new Error("Distribution acceptance requires native gates");
  if (revision !== undefined) {
    const expected = ciOutputs(parseCiPlan(flags.plan ?? "{}", revision), revision);
    for (const [key, value] of Object.entries(expected))
      if (flags[key] !== value)
        throw new Error(`CI output ${key} does not match the analyzed plan`);
  }
  const registered = new Set<string>(["changes", ...gateDefinitions.map(({ name }) => name)]);
  for (const name of Object.keys(needs))
    if (!registered.has(name)) throw new Error(`Unregistered CI gate ${name}`);
  for (const { name, required } of requiredGates(flags)) {
    const result = needs[name]?.result;
    if (required && result === "abandoned")
      throw new Error(
        `CI runner was unavailable for required gate ${name} (abandoned); rerun the gate when runner capacity recovers`,
      );
    if (required ? result !== "success" : result !== "success" && result !== "skipped")
      throw new Error(`CI gate ${name} did not complete successfully (${result ?? "missing"})`);
  }
}
if (process.argv[1] !== undefined && entryPath(process.argv[1]) === entryFile(import.meta.url)) {
  assertCiResult(
    JSON.parse(process.env.GITHUB_NEEDS ?? "{}"),
    distributionRequested(
      process.env.GITHUB_EVENT_NAME ?? "",
      process.env.GITHUB_REF ?? "",
      process.env.RAYPX_DISTRIBUTION_REQUEST,
    ),
    process.env.GITHUB_SHA ?? "",
  );
  console.log("All required CI gates passed; unrelated gates were skipped");
}
