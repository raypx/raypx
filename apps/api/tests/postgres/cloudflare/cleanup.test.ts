import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { verification } from "@raypx/database/schema";
import { pinnedNode } from "@raypx/tooling/repository";
import { like } from "drizzle-orm";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const connection = connectDatabase(url, { max: 1 });
const prefix = `worker-cleanup-${crypto.randomUUID()}`;
beforeAll(() => migrateDatabase(url));
afterAll(async () => {
  try {
    await connection.db.delete(verification).where(like(verification.id, `${prefix}%`));
  } finally {
    await connection.close();
  }
});

describe.each(["direct", "hyperdrive"])("Worker cleanup (%s)", (mode) => {
  it("dispatches the built scheduled handler, removes expired data and preserves active data", async () => {
    const id = `${prefix}-${mode}`;
    await connection.db.insert(verification).values([
      {
        id: `${id}-expired`,
        identifier: id,
        value: "fixture",
        expiresAt: new Date(Date.now() - 2 * 86400_000),
      },
      {
        id: `${id}-active`,
        identifier: id,
        value: "fixture",
        expiresAt: new Date(Date.now() + 86400_000),
      },
    ]);
    const child = spawn(
      pinnedNode(root),
      [fileURLToPath(import.meta.resolve("@raypx/tooling/cloudflare")), root, "--run-api-cleanup"],
      {
        cwd: root,
        env: { ...process.env, TEST_DATABASE_URL: url, TEST_DATABASE_MODE: mode },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    await new Promise<void>((resolve, reject) => {
      let diagnostic = "";
      child.stderr.on("data", (chunk: Buffer) => {
        diagnostic = (diagnostic + chunk.toString())
          .replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[DATABASE_URL]")
          .slice(-2000);
      });
      const timeout = setTimeout(() => child.kill("SIGKILL"), 60000);
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`Worker cleanup fixture exited ${code}: ${diagnostic}`));
      });
    });
    const rows = await connection.db
      .select({ id: verification.id })
      .from(verification)
      .where(like(verification.id, `${id}%`));
    expect(rows).toEqual([{ id: `${id}-active` }]);
  }, 65000);
});
