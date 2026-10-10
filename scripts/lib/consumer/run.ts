import { withRunOptions, type ProcessOptions } from "../process.ts";
import type { ConsumerFixture } from "./fixture.ts";

type FixtureKind = "core" | "server" | "browser";
type ConsumerKind = FixtureKind | "all";

export interface ConsumerOperations {
  createFixture(kind: FixtureKind): Promise<ConsumerFixture>;
  checkTypes(fixture: ConsumerFixture): Promise<void>;
  checkRuntime(fixture: ConsumerFixture, core: boolean): Promise<void>;
  buildCoreBrowser(fixture: ConsumerFixture): Promise<void>;
  buildBrowser(fixture: ConsumerFixture): Promise<void>;
}

async function loadOperations(): Promise<ConsumerOperations> {
  const [{ buildBrowser, buildCoreBrowser }, { createFixture }, { checkRuntime }, { checkTypes }] =
    await Promise.all([
      import("./browser.ts"),
      import("./fixture.ts"),
      import("./runtime.ts"),
      import("./types.ts"),
    ]);
  return { buildBrowser, buildCoreBrowser, createFixture, checkRuntime, checkTypes };
}

/** Validate prepared artifacts without building, typechecking scripts, or changing the env policy. */
export async function runConsumers(
  kind: ConsumerKind = "all",
  options: ProcessOptions = {},
  operations?: ConsumerOperations,
): Promise<void> {
  await withRunOptions(options, async () => {
    options.signal?.throwIfAborted();
    const checks = operations ?? (await loadOperations());
    const kinds = kind === "all" ? (["core", "server", "browser"] as const) : [kind];
    for (const selected of kinds) {
      options.signal?.throwIfAborted();
      const fixture = await checks.createFixture(selected);
      try {
        options.signal?.throwIfAborted();
        await checks.checkTypes(fixture);
        options.signal?.throwIfAborted();
        if (selected === "browser") await checks.buildBrowser(fixture);
        else {
          await checks.checkRuntime(fixture, selected === "core");
          options.signal?.throwIfAborted();
          if (selected === "core") await checks.buildCoreBrowser(fixture);
        }
      } finally {
        await fixture.cleanup();
      }
    }
    options.signal?.throwIfAborted();
  });
}
