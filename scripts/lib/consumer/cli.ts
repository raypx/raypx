import { parseArgs } from "node:util";

/** Reject unsupported or repeated options before citty can dispatch a consumer command. */
export function validateConsumerArgs(rawArgs: string[], allowKind = false): void {
  const { tokens } = parseArgs({
    args: rawArgs,
    options: {
      help: { type: "boolean", short: "h" },
      ...(allowKind ? { kind: { type: "string" as const } } : {}),
    },
    strict: true,
    allowPositionals: false,
    tokens: true,
  });
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.kind !== "option") continue;
    if (seen.has(token.name)) throw new Error(`Specify --${token.name} only once`);
    seen.add(token.name);
  }
}
