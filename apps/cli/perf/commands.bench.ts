import { bench, cli } from "@hona/strobe";
import { commandQuote } from "@raypx/tooling/performance";

export default bench({
  targets: { cli: cli() },
  cases: Object.fromEntries(
    [
      ["version", "--version"],
      ["providers", "ai providers --json"],
      ["models", "ai models --json"],
    ].map(([name, args]) => [
      name!,
      {
        primary: "run.duration",
        metrics: ["cpu.work", "memory.peak"],
        run: async (ctx) => {
          const binary =
            process.env[ctx.variant === "base" ? "RAYPX_STROBE_CLI_BASE" : "RAYPX_STROBE_CLI_HEAD"];
          if (!binary) throw new Error("Missing prepared CLI executable");
          await ctx.exec(commandQuote(binary) + " " + args);
        },
      },
    ]),
  ),
});
