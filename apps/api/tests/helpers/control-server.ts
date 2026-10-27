/** Explicit real-backend browser fixture. Never imported by production routes. */
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { serve } from "bun";
import { RelayHub } from "../../server/relay/hub.js";
import { user, schema } from "@raypx/database/schema";
import { eq } from "drizzle-orm";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createAuth, readAuthSession } from "@raypx/auth/server";
import { createApiApp } from "../../server/api.js";
import { ControlService } from "../../server/control/service.js";
import { createControlRepository } from "../../server/control/repository.js";
const url = process.env.TEST_DATABASE_URL;
const port = Number(process.env.CONTROL_E2E_PORT);
if (
  process.env.RAYPX_VALIDATION !== "1" ||
  !url ||
  !new URL(url).pathname.endsWith("_test") ||
  !Number.isInteger(port) ||
  port < 1024
)
  throw new Error("Explicit isolated test database and fixture port required");
await migrateDatabase(url);
const connection = connectDatabase(url);
const email = "control-e2e@example.com";
await connection.db.delete(user).where(eq(user.email, email));
const auth = createAuth({
  database: drizzleAdapter(connection.db, { provider: "pg", schema }),
  config: {
    baseURL: `http://127.0.0.1:${port}`,
    secret: "raypx-browser-fixture-secret-32-characters",
    trustedOrigins: ["http://127.0.0.1:4173", "http://127.0.0.1:4174"],
    production: false,
  },
  mailer: { async sendVerification() {}, async sendPasswordReset() {} },
});
const control = new ControlService(createControlRepository(connection.db));
const hub = new RelayHub(async (run) => {
  try {
    return await run(control);
  } catch (error) {
    // Fixture diagnostics must not include SQL, task bodies or credentials.
    let failure: unknown = error,
      code = "UNAVAILABLE";
    for (let depth = 0; depth < 4 && failure && typeof failure === "object"; depth++) {
      if (
        "code" in failure &&
        typeof failure.code === "string" &&
        /^[A-Z0-9_]{1,60}$/.test(failure.code)
      ) {
        code = failure.code;
        break;
      }
      failure = "cause" in failure ? failure.cause : undefined;
    }
    console.error(`Control fixture operation failed: ${code}`);
    throw error;
  }
});
const app = createApiApp({
  authHandler: (request) => auth.handler(request),
  readSession: (headers) => readAuthSession(auth, headers),
  allowedOrigins: ["http://127.0.0.1:4173", "http://127.0.0.1:4174"],
  control,
  onRevoke: (userId, deviceId) => hub.revoke(userId, deviceId),
});
const signup = await app.fetch(
  new Request(`http://127.0.0.1:${port}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:4173" },
    body: JSON.stringify({
      email,
      password: "Raypx-control-test-123",
      name: "Control Browser Test",
    }),
  }),
);
if (signup.status !== 200) throw new Error("Unable to seed browser fixture account");
await connection.db.update(user).set({ emailVerified: true }).where(eq(user.email, email));
const server = serve<{ id: string }>({
  hostname: "127.0.0.1",
  port,
  fetch(request, listener) {
    if (new URL(request.url).pathname === "/relay") {
      const origin = request.headers.get("origin");
      if (origin && !["http://127.0.0.1:4173", "http://127.0.0.1:4174"].includes(origin))
        return new Response(null, { status: 403 });
      if (listener.upgrade(request, { data: { id: crypto.randomUUID() } })) return;
      return new Response(null, { status: 426 });
    }
    return app.fetch(request);
  },
  websocket: {
    open(socket) {
      hub.open({
        id: socket.data.id,
        send: (frame) => {
          socket.send(JSON.stringify(frame));
        },
        close: (code, reason) => socket.close(code, reason),
      });
    },
    message(socket, value) {
      if (typeof value === "string") void hub.receive(socket.data.id, value);
    },
    close(socket) {
      void hub.close(socket.data.id);
    },
  },
});
console.log(`Control browser fixture ready on 127.0.0.1:${port}`);
const stop = async () => {
  await hub.shutdown();
  await server.stop(true);
  await connection.db.delete(user).where(eq(user.email, email));
  await connection.close();
  process.exit(0);
};
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
