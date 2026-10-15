import { createInterface } from "node:readline/promises";
import { localParams, type LocalMethod } from "@raypx/contracts/local";
import { createRuntime } from "../runtime";
import { LocalError } from "../runtime/errors";

export async function runCommand(args: string[], options: { dataDir?: string; profile?: string }) {
  const [group, action, ...rest] = args.filter((value) => value !== "--json" && value !== "--yes");
  const json = args.includes("--json");
  if (!group || group === "help" || group === "--help") {
    console.log(
      "Raypx local CLI\n\nraypx files roots\nraypx files authorize <absolute-directory>\nraypx files <list|stat|read|write|mkdir|move|delete> '<JSON params>'\nraypx jobs <list|create|update|delete|run|history> '<JSON params>'\nraypx tools run '<JSON command>'\n\nOptions: --json --yes --profile <name> --data-dir <directory>\nDelete requires --yes or an interactive confirmation. Jobs execute once; scheduling requires Desktop.",
    );
    return;
  }
  let method: string = `${group}.${action}`;
  let params: unknown =
    rest[0] && !(group === "files" && action === "authorize") ? JSON.parse(rest[0]) : {};
  if (group === "files" && action === "roots") {
    method = "roots.list";
    params = {};
  }
  if (group === "files" && action === "authorize") {
    method = "roots.register";
    params = { path: rest[0] };
  }
  if (!(method in localParams) || method.startsWith("terminal.") || method === "runtime.info")
    throw new LocalError("UNKNOWN_COMMAND", "Unknown command; use raypx --help");
  if (method === "files.delete") {
    let confirmed = args.includes("--yes");
    if (!confirmed && process.stdin.isTTY && !json) {
      const prompt = createInterface({ input: process.stdin, output: process.stderr });
      try {
        confirmed = (await prompt.question("Delete this path permanently? Type yes: ")) === "yes";
      } finally {
        prompt.close();
      }
    }
    if (!confirmed)
      throw new LocalError(
        "CONFIRMATION_REQUIRED",
        "Deletion requires --yes or interactive confirmation",
      );
    params = { ...(params as Record<string, unknown>), confirmed: true };
  }
  const runtime = createRuntime(options);
  const stop = () => {
    void runtime.close();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const result = await runtime.request(method as LocalMethod, params);
    console.log(JSON.stringify(result, null, json ? undefined : 2));
  } finally {
    await runtime.close();
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}
