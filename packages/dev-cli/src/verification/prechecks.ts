import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkLocales, policy } from "../policy.js";

/** VP restores this timing evidence with the cached result; it never decides task reuse. */
export function runPrecheck(root: string, name: string) {
  if (name !== "policy" && name !== "locales") throw new Error("Unknown verification check");
  const started = performance.now();
  const findings = name === "policy" ? policy(root) : checkLocales(root);
  if (findings.length) throw new Error(findings.join("\n"));
  const durationMs = Math.round(performance.now() - started);
  const directory = join(root, ".artifacts/verification/prechecks");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${name}.json`), JSON.stringify({ durationMs }));
  console.log(`${name} passed in ${durationMs}ms`);
}
