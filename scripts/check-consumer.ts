import {
  buildBrowser,
  buildCoreBrowser,
  checkRuntime,
  checkTypes,
  createFixture,
  repository,
  run,
} from "./consumer/harness.ts";

console.log(
  (
    await run(
      "bun",
      ["--no-env-file", "test", "scripts/consumer/lock.test.ts", "scripts/consumer/run.test.ts"],
      repository,
    )
  ).trim(),
);

for (const kind of ["core", "server", "browser"] as const) {
  const fixture = await createFixture(kind);
  try {
    await checkTypes(fixture);
    if (kind === "browser") await buildBrowser(fixture);
    else {
      await checkRuntime(fixture, kind === "core");
      if (kind === "core") await buildCoreBrowser(fixture);
    }
  } finally {
    await fixture.cleanup();
  }
}
