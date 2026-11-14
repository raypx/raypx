/** Exclusive fresh-deployment browser fixture. Run only against an empty disposable database. */
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { user } from "@raypx/database/schema";
import { createMailer, type MailMessage } from "@raypx/email/server";
import { createRuntime } from "../../src/runtime/shared.js";
import { createApiLogging } from "../../src/logging.js";
import { getApiEnvironment } from "../../src/env.js";

const url = process.env.TEST_DATABASE_URL;
const port = Number(process.env.BOOTSTRAP_E2E_PORT);
if (
  process.env.RAYPX_VALIDATION !== "1" ||
  !url ||
  !["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
  !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname) ||
  !Number.isInteger(port) ||
  port < 1024
)
  throw new Error("Explicit disposable loopback database and fixture port required");
await migrateDatabase(url);
const connection = connectDatabase(url);
if ((await connection.db.select().from(user).limit(1)).length)
  throw new Error("Fresh-deployment browser fixture requires zero accounts");
const webOrigin = process.env.BOOTSTRAP_E2E_WEB_URL ?? "http://127.0.0.1:56540";
if (new URL(webOrigin).hostname !== "127.0.0.1" || new URL(webOrigin).protocol !== "http:")
  throw new Error("Fixture Web must use loopback HTTP");
const messages: MailMessage[] = [];
const logger = createApiLogging({ environment: "test", sink() {} });
const runtime = await createRuntime(
  getApiEnvironment({
    NODE_ENV: "test",
    DATABASE_URL: url,
    AUTH_URL: `http://127.0.0.1:${port}`,
    ALLOWED_ORIGINS: webOrigin,
  }),
  {
    logger,
    connect: () => connection,
    closeLogger: () => logger.close(),
    createMailer: (options) =>
      createMailer({
        ...options,
        transport: {
          async send(message) {
            messages.push(message);
          },
        },
      }),
  },
);
const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/__fixture/mail-count")
      return Response.json({ count: messages.length });
    if (request.method === "POST" && path === "/__fixture/verify-latest") {
      const link = messages.at(-1)?.text.match(/http[^\s]+\/verify-email[^\s]+/)?.[0];
      if (!link) return new Response(null, { status: 404 });
      const response = await runtime.app.fetch(new Request(link));
      return Response.json({ verified: response.ok || response.status === 302 });
    }
    return runtime.app.fetch(request);
  },
});
console.log("Fresh-deployment browser fixture ready");
async function close() {
  await server.stop(true);
  await runtime.close();
  process.exit(0);
}
process.once("SIGTERM", close);
process.once("SIGINT", close);
