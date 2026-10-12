import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it, onTestFinished, vi } from "vite-plus/test";

import { runCommand } from "../runtime/process.js";
import { verifyNitroRuntimes } from "./nitro.js";

async function runtimeFixture(privateRouteStatus: 401 | 404): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "raypx-nitro-probe-test-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  for (const app of ["web", "api"]) {
    const output = join(root, "apps", app, ".output");
    await mkdir(join(output, "server"), { recursive: true });
    await writeFile(
      join(output, "nitro.json"),
      JSON.stringify({ preset: "bun", serverEntry: "server/index.mjs" }),
    );
    // The API only returns the configured auth response for a correctly encoded
    // bootstrap POST. A wrong method, body or content type must fail the probe.
    await writeFile(
      join(output, "server/index.mjs"),
      `Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.NITRO_PORT), async fetch(request) {
  if (${JSON.stringify(app)} === "api" && new URL(request.url).pathname === "/internal/execution/bootstrap") {
    const body = await request.text();
    const valid = request.method === "POST"
      && request.headers.get("content-type") === "application/json"
      && body === JSON.stringify({ json: {} });
    return new Response(null, { status: valid ? ${privateRouteStatus} : 400 });
  }
  return new Response("Raypx");
}});
`,
    );
  }
  return root;
}

it.each([
  [401, true],
  [404, false],
] as const)(
  "the default API runtime probe accepts auth denial and detects a missing route (HTTP %i)",
  async (status, accepted) => {
    const operation = verifyNitroRuntimes(
      {
        log: vi.fn(),
        processEnv: Object.fromEntries(
          Object.entries(process.env).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
          ),
        ),
        repositoryRoot: await runtimeFixture(status),
        runCommand,
      },
      { captureOutput: true },
    );
    if (accepted) await expect(operation).resolves.toBeUndefined();
    else
      await expect(operation).rejects.toThrow("/internal/execution/bootstrap: received HTTP 404");
  },
  15_000,
);
