import { join, sep } from "node:path";
import { scriptLogger } from "../logger.ts";
import { run } from "../process.ts";
import type { ConsumerFixture } from "./fixture.ts";
import { condition, entries, specifier, write } from "./manifest.ts";

export async function checkRuntime(fixture: ConsumerFixture, core: boolean): Promise<void> {
  const imports: string[] = [];
  for (const manifest of fixture.packages.values())
    for (const [subpath, value] of entries(manifest)) {
      const target = condition(value, "import");
      if (!target?.endsWith(".js") || (core && subpath.startsWith("./react"))) continue;
      imports.push(specifier(manifest, subpath));
    }
  await write(
    join(fixture.directory, "smoke.mjs"),
    `
import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
for (const spec of ${JSON.stringify(imports)}) {
  const location = realpathSync(fileURLToPath(import.meta.resolve(spec)));
  assert(location.startsWith(${JSON.stringify(fixture.directory + sep)}), spec + " escaped fixture");
  await import(spec);
}
await assert.rejects(import("@raypx/client/dist/index.js"));
${
  core
    ? `
await assert.rejects(import("react"));
await assert.rejects(import("@tanstack/react-query"));
const { healthResponseSchema } = await import("@raypx/contracts/health");
assert.equal(healthResponseSchema.parse({status:"ok",service:"raypx-api"}).status, "ok");
const { parseClientEnv } = await import("@raypx/env/client");
assert.deepEqual(parseClientEnv({PRIVATE_SECRET:"not-public"}), {});
`
    : `
const { createDatabase, runMigrations, withTransaction } = await import("@raypx/db");
const { user } = await import("@raypx/db/schema");
const connection = createDatabase("./consumer.db");
try {
  runMigrations(connection.db); runMigrations(connection.db);
  assert.deepEqual(withTransaction(connection.db, tx => tx.select().from(user).all()), []);
  connection.checkHealth();
  const { createAuth } = await import("@raypx/auth");
  const auth = createAuth({database:connection.db,secret:"consumer-secret-".repeat(4),baseURL:"https://consumer.test",environment:"test"});
  assert.equal(await auth.api.getSession({headers:new Headers()}), null);
} finally { connection.close(); }
const { getStorage, closeStorage } = await import("@raypx/storage");
const { createCache } = await import("@raypx/storage/cache");
const storage = getStorage({memory:true});
try {
  const cache = createCache({storage,namespace:"consumer",schema:{parse(value){if(typeof value!=="string")throw new Error("Invalid value");return value}}});
  assert.equal(await cache.getOrSet("key",30,()=>"value"), "value");
  assert.deepEqual(await cache.get("key"), {hit:true,value:"value"});
  await cache.invalidate("key"); assert.deepEqual(await cache.get("key"),{hit:false});
} finally { await closeStorage(); }
const { healthResponse } = await import("@raypx/api/health");
assert.equal((await healthResponse().json()).status, "ok");
`
}
console.log("Consumer runtime passed: " + (process.versions.bun ? "Bun" : "Node"));
`,
  );
  for (const runtime of ["node", "bun"]) {
    const output = await run(
      runtime,
      runtime === "bun" ? ["--no-env-file", "smoke.mjs"] : ["smoke.mjs"],
      fixture.directory,
    );
    scriptLogger.log(output.trim());
  }
}
