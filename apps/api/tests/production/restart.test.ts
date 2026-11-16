import { expect, it } from "vitest";
import { connectDatabase } from "@raypx/database/connection";
import { eq, sql } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import { createApiClient } from "@raypx/client/api";
import { user, spaces } from "@raypx/database/schema";
import {
  cleanProductionAcceptance,
  productionAcceptanceState,
} from "../helpers/production-acceptance.js";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("Production restart acceptance requires TEST_DATABASE_URL");
const artifact = fileURLToPath(new URL("../../.output/server/index.mjs", import.meta.url));

it("drains an admitted production HTTP request across SIGTERM and restarts cleanly", async () => {
  const originalState = await productionAcceptanceState(url);
  const socket = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = socket.port!;
  await socket.stop(true);
  const origin = `http://127.0.0.1:${port}`;
  const db = connectDatabase(url, { max: 2 });
  const start = () =>
    Bun.spawn([process.execPath, "--no-env-file", artifact], {
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "production",
        PORT: String(port),
        NITRO_PORT: String(port),
        HOST: "127.0.0.1",
        DATABASE_URL: url,
        DATABASE_MIGRATE_ON_START: "false",
        SERVER_ROLE: "api",
        PUBLIC_URL: "https://restart.example.invalid",
        EXTRA_ALLOWED_ORIGINS: origin,
        AUTH_SECRET: "synthetic-production-restart-secret",
        APP_KEY: "synthetic-production-restart-key-value",
        JOBS_ENABLED: "false",
      },
      stdout: "ignore",
      stderr: "ignore",
    });
  let child = start();
  const email = `restart-${crypto.randomUUID()}@example.invalid`;
  let spaceId: typeof spaces.$inferSelect.id | undefined;
  const streamAbort = new AbortController();
  async function ready() {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(origin + "/health", { signal: AbortSignal.timeout(300) })).status;
          } catch {
            return 0;
          }
        },
        { timeout: 15_000 },
      )
      .toBe(200);
  }
  try {
    await ready();
    const signup = await fetch(origin + "/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ name: "Restart fixture", email, password: crypto.randomUUID() }),
    });
    expect(signup.status).toBe(200);
    const cookie = signup.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const client = createApiClient({ baseUrl: origin, headers: { cookie, origin } });
    const space = await client.spaces.create({ name: "Production restart fixture" });
    spaceId = space.space.id;
    const agent = await client.agents.create({
      spaceId: space.space.id,
      agent: { name: "Restart fixture", instructions: "", model: { modelId: "unavailable" } },
    });
    const feed = await fetch(
      `${origin}/api/events?spaceId=${space.space.id}&conversationId=${agent.conversation.id}&after=0`,
      {
        headers: { cookie, origin, accept: "text/event-stream" },
        signal: streamAbort.signal,
      },
    );
    expect(feed.status).toBe(200);
    const reader = feed.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"ready"');
    const locked = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const holding = db.db.transaction(async (tx) => {
      await tx.execute(sql`lock table public.system_configuration in access exclusive mode`);
      locked.resolve();
      await release.promise;
    });
    await locked.promise;
    const request = fetch(origin + "/api/rpc/configuration/public", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"json":{}}',
    });
    try {
      await expect
        .poll(async () => {
          const rows = await db.db.execute<{ waiting: boolean }>(sql`
          select exists(select 1 from pg_stat_activity where datname = current_database()
            and wait_event_type = 'Lock' and query ilike '%system_configuration%') as waiting`);
          return rows[0]?.waiting;
        })
        .toBe(true);
      child.kill("SIGTERM");
    } finally {
      release.resolve();
      await holding;
    }
    expect((await request).status).toBe(200);
    const closeDeadline = setTimeout(() => streamAbort.abort(), 5000);
    let ending = "";
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        ending += new TextDecoder().decode(chunk.value);
      }
    } finally {
      clearTimeout(closeDeadline);
    }
    expect(ending).toContain('"code":1001');
    expect(ending).toContain('"retryAfterMs":3000');
    expect(await child.exited).toBe(0);
    child = start();
    await ready();
  } finally {
    streamAbort.abort();
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    await child.exited;
    clearTimeout(timer);
    if (spaceId) await db.db.delete(spaces).where(eq(spaces.id, spaceId));
    await db.db.delete(user).where(eq(user.email, email));
    await db.close();
    await cleanProductionAcceptance(url, email, originalState);
  }
}, 45_000);
