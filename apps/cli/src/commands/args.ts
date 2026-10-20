import { parseArgs } from "node:util";
import type { ArgsDef } from "citty";

export const globalArgs = {
  "data-dir": { type: "string", description: "Local state directory" },
  profile: { type: "string", description: "Local profile name" },
  json: { type: "boolean", description: "Print a finite JSON result" },
  yes: { type: "boolean", description: "Confirm file deletion" },
  help: { type: "boolean", alias: "h", description: "Show command help" },
  version: { type: "boolean", alias: "v", description: "Show the executable version" },
} as const satisfies ArgsDef;

export function parseCliArgs(rawArgs: string[]) {
  // citty intentionally parses permissively. Validate tokens first, retaining
  // util.parseArgs' end-of-options semantics instead of scanning raw argv.
  const { values, positionals, tokens } = parseArgs({
    args: rawArgs,
    allowPositionals: true,
    strict: true,
    tokens: true,
    options: Object.fromEntries(
      Object.entries(globalArgs).map(([name, arg]) => [
        name,
        { type: arg.type, ...("alias" in arg ? { short: arg.alias } : {}) },
      ]),
    ),
  });
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.kind !== "option") continue;
    if (seen.has(token.name)) throw new Error(`Duplicate option: --${token.name}`);
    seen.add(token.name);
    if (token.value === "") throw new Error(`--${token.name} requires a nonempty value`);
  }
  const options: { dataDir?: string; profile?: string } = {};
  if (typeof values["data-dir"] === "string") options.dataDir = values["data-dir"];
  if (typeof values.profile === "string") options.profile = values.profile;
  return {
    positionals,
    options,
    json: values.json === true,
    yes: values.yes === true,
    help: values.help === true,
    version: values.version === true,
  };
}

export type CliArgs = ReturnType<typeof parseCliArgs>;
