import { fileURLToPath } from "node:url";
import { defineCommand } from "citty";
import { installedCommands } from "../lib/cli/bootstrap.ts";

export default defineCommand({
  meta: { name: "verify", description: installedCommands.verify.description },
  args: {
    verbose: {
      type: "boolean",
      default: false,
      description: "Stream stage output instead of showing only progress and failures.",
    },
  },
  async run({ args }) {
    const [{ runVerify }, { createVerifyDependencies }] = await Promise.all([
      import("../lib/verify/run.ts"),
      import("../lib/verify/runtime.ts"),
    ]);
    const controller = new AbortController();
    let interrupted: "SIGINT" | "SIGTERM" | undefined;
    const stop = (signal: "SIGINT" | "SIGTERM") => {
      interrupted ??= signal;
      controller.abort(new DOMException("Verification cancelled", "AbortError"));
    };
    const interrupt = () => stop("SIGINT");
    const terminate = () => stop("SIGTERM");
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    try {
      const report = await runVerify(
        createVerifyDependencies(fileURLToPath(new URL("../../", import.meta.url)), process.env),
        { verbose: args.verbose, signal: controller.signal },
      );
      if (!report.ok)
        process.exitCode = interrupted === "SIGINT" ? 130 : interrupted === "SIGTERM" ? 143 : 1;
    } finally {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
    }
  },
});
