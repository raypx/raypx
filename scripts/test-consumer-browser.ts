import { join, sep } from "node:path";
import { serve, file as bunFile } from "bun";
import { buildBrowser, createFixture, repository, run } from "./consumer/harness.ts";

const fixture = await createFixture("browser");
try {
  await buildBrowser(fixture);
  const directory = join(fixture.directory, "browser-dist");
  const server = serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      const path = join(directory, pathname === "/" ? "index.html" : decodeURIComponent(pathname));
      if (!path.startsWith(directory + sep)) return new Response("Not found", { status: 404 });
      const file = bunFile(path);
      if (!(await file.exists())) return new Response("Not found", { status: 404 });
      return new Response(file);
    },
  });
  try {
    const output = await run(
      "bun",
      ["run", "playwright", "test", "--config", join(repository, "playwright.consumer.config.ts")],
      repository,
      120_000,
      { RAYPX_CONSUMER_URL: String(server.url) },
    );
    console.log(output.trim());
  } finally {
    await server.stop(true);
  }
} finally {
  await fixture.cleanup();
}
