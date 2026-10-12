import { contextualCommand } from "../runtime/command.js";
import {
  runRepositoryCommands,
  type RepositoryProcessDependencies,
} from "../runtime/process-dependencies.js";

/**
 * Route trees are deliberately absent here. `tsr generate` does not know about
 * TanStack Start, so it writes a route tree without the `Register` footer that
 * `@tanstack/start-plugin-core` appends — a strictly worse file that still passes
 * `tsc`. The Start Vite plugin owns those files; `dev` and `build` produce them.
 */
export async function runGenerate(
  dependencies: RepositoryProcessDependencies,
  // `drizzle-kit generate` exits 2 and asks for `--hints '<json-array>'` when a
  // diff is ambiguous, so extra flags have to reach it unchanged.
  extraArgs: readonly string[] = [],
): Promise<void> {
  await runRepositoryCommands(dependencies, "generate", [
    ["bun", "run", "--cwd", "packages/db", "generate", ...extraArgs],
  ]);
}

export const generateCommand = contextualCommand("generate", "repository", {
  meta: { name: "generate", description: "Regenerate database artifacts" },
  async run(context, { rawArgs }) {
    await runGenerate(context, rawArgs);
  },
});
