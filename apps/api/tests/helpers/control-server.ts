/** Explicit real-backend browser fixture. Never imported by production routes. */
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { serve } from "bun";
import { RelayHub } from "@raypx/control/relay";
import { user, schema } from "@raypx/database/schema";
import { eq, inArray } from "drizzle-orm";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createAuth, readAuthSession } from "@raypx/auth/server";
import { createApiApp } from "./app.js";
import { ControlService } from "@raypx/control";
import { createControlRepository } from "@raypx/control/postgres";
import {
  ConversationRunner,
  createApprovalsService,
  createComputerTools,
} from "@raypx/agents/server";
import {
  createAgentsRepository,
  createConversationsRepository,
  createConversationFanout,
  createApprovalsRepository,
  cancelSpaceRuns,
} from "@raypx/agents/server/postgres";
import {
  createSpaceAccess,
  createSpaceFanout,
  createSpaceManagement,
} from "@raypx/spaces/server/postgres";
import { createRoutinesService } from "@raypx/jobs/routines";
import { createRoutinesRepository } from "@raypx/jobs/routines/postgres";
import { createSpaceMemoryService } from "@raypx/memory/space-server";
import { createSpaceMemoryRepository } from "@raypx/memory/space-server/postgres";
import type { ConversationId } from "@raypx/core/agents";
import { ConversationStream } from "../../src/conversations/stream.js";
import { browserModelFixture } from "./browser-model.js";
import { createModelConnections } from "../../src/conversations/connections.js";
import { withMemoryTools } from "../../src/conversations/memory-tools.js";
import { createModelConnectionsRepository } from "../../src/conversations/connections-postgres.js";
import {
  applicationSecretKeyProvider,
  createPostgresSecretStore,
  sealStoredSecret,
  openStoredSecret,
} from "../../src/conversations/secrets.js";
import { createComputersService } from "@raypx/computers/server";
import { createComputersRepository } from "@raypx/computers/server/postgres";
import { createMemoryComputerProvider } from "@raypx/providers/computer";
import { AuditService } from "../../src/admin/audit.js";
import { createAdministrationRepository } from "../../src/admin/repository.js";
import { createConfigRepository } from "../../src/config/repository.js";
import { createConfigService } from "../../src/config/service.js";
import { createAccessPolicy } from "../../src/access.js";
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
const accounts = [
  { email, name: "Control Browser Test" },
  { email: "control-member-web@example.com", name: "Web Space Member" },
  { email: "control-member-desktop@example.com", name: "Desktop Space Member" },
];
const accountEmails = accounts.map((account) => account.email);
await connection.db.delete(user).where(inArray(user.email, accountEmails));
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
// The in-memory provider lets browser journeys start and stop a computer without an Engine.
const computerProvider = createMemoryComputerProvider();
const computers = createComputersService(
  createComputersRepository(connection.db, { perSpace: 10, perMember: 100 }),
  computerProvider,
  "memory",
);
// Sign-up reads the registration switch, so the fixture needs the real configuration service.
const audit = new AuditService(createAdministrationRepository(connection.db));
const config = createConfigService({
  repository: createConfigRepository(connection.db, audit),
  audit,
  access: createAccessPolicy(),
});
const spaces = createSpaceAccess(connection.db);
const model = browserModelFixture();
const modelConnections = createModelConnections(
  createModelConnectionsRepository(connection.db),
  createPostgresSecretStore(
    connection.db,
    applicationSecretKeyProvider("browser-fixture-model-encryption-key"),
  ),
  model.connectionTransport,
);
const conversationModels = modelConnections.models(model.models);
const agentApprovals = createApprovalsService(createApprovalsRepository(connection.db));
const spaceMemory = createSpaceMemoryService(createSpaceMemoryRepository(connection.db));
const runner = new ConversationRunner(
  createConversationsRepository(connection.db),
  conversationModels,
  undefined,
  undefined,
  {
    tools: withMemoryTools(
      createComputerTools(computers, computerProvider, []),
      spaceMemory,
      () => [],
    ),
    approvals: agentApprovals,
  },
  { recallMemory: (scope, run) => spaceMemory.recall(scope, run.agentId) },
);
const spaceManagement = createSpaceManagement(connection.db, {
  beforeMemberRemoved: cancelSpaceRuns,
  afterMemberRemoved: (scope, accountId) => runner.cancelMember(scope.spaceId, accountId),
  afterDeletionClaimed: (spaceId) => runner.cancelMember(spaceId),
});
const routineKeys = applicationSecretKeyProvider("browser-fixture-routine-encryption-key");
const routines = createRoutinesService(createRoutinesRepository(connection.db), {
  dispatch: (scope, conversationId) => runner.dispatch(scope, conversationId as ConversationId),
  emailDomain: "routines.example.test",
  secrets: {
    seal: (accountId, secretId, value) => sealStoredSecret(routineKeys, accountId, secretId, value),
    open: (accountId, secretId, value) => openStoredSecret(routineKeys, accountId, secretId, value),
  },
});
const fanout = createConversationFanout(url);
const spaceFanout = createSpaceFanout(url);
const readSession = (headers: Headers) => readAuthSession(auth, headers);
const stream = new ConversationStream({
  spaces,
  conversations: runner.conversations,
  fanout,
  readSession,
  live: runner.live,
  spaceEvents: spaceManagement,
  spaceFanout,
});
await stream.start();
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
  readSession,
  allowedOrigins: ["http://127.0.0.1:4173", "http://127.0.0.1:4174"],
  control,
  config,
  computers,
  modelConnections,
  agentApprovals,
  routines,
  spaceMemory,
  spaces,
  spaceManagement,
  agents: createAgentsRepository(connection.db),
  conversationModels,
  conversations: runner.conversations,
  onRevoke: (userId, deviceId) => hub.revoke(userId, deviceId),
});
for (const account of accounts) {
  const signup = await app.fetch(
    new Request(`http://127.0.0.1:${port}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:4173" },
      body: JSON.stringify({ ...account, password: "Raypx-control-test-123" }),
    }),
  );
  if (signup.status !== 200) throw new Error("Unable to seed browser fixture account");
  await connection.db
    .update(user)
    .set({ emailVerified: true })
    .where(eq(user.email, account.email));
}
type SocketData =
  | { id: string; kind: "relay" }
  | { id: string; kind: "conversation"; accountId: string; headers: Headers };
const server = serve<SocketData>({
  hostname: "127.0.0.1",
  port,
  async fetch(request, listener) {
    const path = new URL(request.url).pathname;
    if (path === "/events" || path === "/fixture/conversation/complete") {
      const origin = request.headers.get("origin");
      if (origin && !["http://127.0.0.1:4173", "http://127.0.0.1:4174"].includes(origin))
        return new Response(null, { status: 403 });
      const session = await readSession(request.headers);
      if (!session) return new Response(null, { status: 401 });
      if (path === "/fixture/conversation/complete") {
        if (request.method !== "POST") return new Response(null, { status: 405 });
        const body = await request.text();
        let conversationId: string | undefined;
        if (body) {
          try {
            const input: unknown = JSON.parse(body);
            if (
              !input ||
              typeof input !== "object" ||
              !("conversationId" in input) ||
              typeof input.conversationId !== "string" ||
              !input.conversationId ||
              input.conversationId.length > 128
            )
              return new Response(null, { status: 400 });
            conversationId = input.conversationId;
          } catch {
            return new Response(null, { status: 400 });
          }
        }
        model.complete(conversationId);
        return new Response(null, { status: 204 });
      }
      if (
        listener.upgrade(request, {
          data: {
            id: crypto.randomUUID(),
            kind: "conversation",
            accountId: session.user.id,
            headers: request.headers,
          },
        })
      )
        return;
      return new Response(null, { status: 426 });
    }
    if (new URL(request.url).pathname === "/relay") {
      const origin = request.headers.get("origin");
      if (origin && !["http://127.0.0.1:4173", "http://127.0.0.1:4174"].includes(origin))
        return new Response(null, { status: 403 });
      if (listener.upgrade(request, { data: { id: crypto.randomUUID(), kind: "relay" } })) return;
      return new Response(null, { status: 426 });
    }
    return app.fetch(request);
  },
  websocket: {
    open(socket) {
      if (socket.data.kind === "conversation") {
        stream.open(socket.data.id, socket.data.accountId, socket.data.headers, {
          send: (frame) => {
            socket.send(JSON.stringify(frame));
          },
          close: (code, reason) => socket.close(code, reason),
        });
        return;
      }
      hub.open({
        id: socket.data.id,
        send: (frame) => {
          socket.send(JSON.stringify(frame));
        },
        close: (code, reason) => socket.close(code, reason),
      });
    },
    message(socket, value) {
      if (socket.data.kind === "conversation") {
        if (typeof value === "string") stream.receive(socket.data.id, value);
        return;
      }
      if (typeof value === "string") void hub.receive(socket.data.id, value);
    },
    close(socket) {
      if (socket.data.kind === "conversation") {
        stream.close(socket.data.id);
        return;
      }
      void hub.close(socket.data.id);
    },
  },
});
console.log(`Control browser fixture ready on 127.0.0.1:${port}`);
const stop = async () => {
  await hub.shutdown();
  await stream.shutdown();
  await runner.close();
  await fanout.close();
  await spaceFanout.close();
  await server.stop(true);
  await connection.db.delete(user).where(inArray(user.email, accountEmails));
  await connection.close();
  process.exit(0);
};
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
