/** Explicit real-backend browser fixture. Never imported by production routes. */
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { serve } from "bun";
import { user, schema } from "@raypx/database/schema";
import { eq, inArray } from "drizzle-orm";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createAuth, readAuthSession } from "@raypx/auth/server";
import { createApiApp } from "./app.js";
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
  createProtectedInputsService,
  createComputerUseQueue,
  cancelSpaceRuns,
} from "@raypx/agents/server/postgres";
import {
  createSpaceAccess,
  createSpaceFanout,
  createSpaceManagement,
} from "@raypx/spaces/server/postgres";
import { createPagesService } from "@raypx/pages/server";
import { createPagesRepository } from "@raypx/pages/server/postgres";
import { createSkillsService } from "@raypx/skills/server";
import { createSkillsRepository } from "@raypx/skills/server/postgres";
import { createMcpTransport } from "@raypx/providers/mcp";
import { createOpenApiTransport } from "@raypx/providers/openapi";
import { createMcpServers } from "../../src/conversations/mcp-servers.js";
import { createMcpServersRepository } from "../../src/conversations/mcp-postgres.js";
import { withPageTools } from "../../src/conversations/page-tools.js";
import { withSkillTools } from "../../src/conversations/skill-tools.js";
import { withMcpTools } from "../../src/conversations/mcp-tools.js";
import { createOpenApiServers } from "../../src/conversations/openapi-servers.js";
import { createOpenApiServersRepository } from "../../src/conversations/openapi-postgres.js";
import { withOpenApiTools } from "../../src/conversations/openapi-tools.js";
import { fixtureMcpResponse } from "./browser-mcp.js";
import { browserOpenApiFixture } from "./browser-openapi.js";
import { createRoutinesService } from "@raypx/jobs/routines";
import { createRoutinesRepository } from "@raypx/jobs/routines/postgres";
import { createSpaceMemoryService } from "@raypx/memory/space-server";
import { createSpaceMemoryRepository } from "@raypx/memory/space-server/postgres";
import type { ConversationId } from "@raypx/core/agents";
import { conversationIdSchema } from "@raypx/core/agents";
import { spaceIdSchema } from "@raypx/core/spaces";
import { ConversationStream } from "../../src/conversations/stream.js";
import { browserModelFixture } from "./browser-model.js";
import { seedBrowserHistory } from "./browser-history.js";
import { createModelConnections } from "../../src/conversations/connections.js";
import { withMemoryTools } from "../../src/conversations/memory-tools.js";
import { createModelConnectionsRepository } from "../../src/conversations/connections-postgres.js";
import {
  applicationSecretKeyProvider,
  createPostgresSecretStore,
  sealStoredSecret,
  openStoredSecret,
} from "../../src/conversations/secrets.js";
import {
  createComputersService,
  createComputerScreensService,
  createDeviceConnectorRegistry,
  createDeviceComputersService,
} from "@raypx/computers/server";
import {
  createComputersRepository,
  createComputerScreenRepository,
  revokeComputerScreenControl,
  createDeviceComputersRepository,
} from "@raypx/computers/server/postgres";
import { withDeviceComputerTools } from "../../src/conversations/device-tools.js";
import { browserDeviceFixture } from "./browser-devices.js";
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
  !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname) ||
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
// The in-memory provider lets browser journeys start and stop a computer without an Engine.
const computerProvider = createMemoryComputerProvider();
const computersRepository = createComputersRepository(connection.db, {
  perSpace: 10,
  perMember: 100,
});
const computerScreens = createComputerScreensService(
  computersRepository,
  createComputerScreenRepository(connection.db),
  computerProvider,
);
const computers = createComputersService(computersRepository, computerProvider, "memory");
const deviceComputersRepository = createDeviceComputersRepository(
  connection.db,
  `http://127.0.0.1:${port}`,
);
const deviceConnector = createDeviceConnectorRegistry(deviceComputersRepository);
const deviceComputers = createDeviceComputersService(deviceComputersRepository, deviceConnector);
const browserDevices = browserDeviceFixture(deviceComputersRepository, deviceConnector);
// Sign-up reads the registration switch, so the fixture needs the real configuration service.
const audit = new AuditService(createAdministrationRepository(connection.db));
const config = createConfigService({
  repository: createConfigRepository(connection.db, audit),
  audit,
  access: createAccessPolicy(),
});
const spaces = createSpaceAccess(connection.db);
const model = browserModelFixture();
const openApiResponse = browserOpenApiFixture();
const modelConnections = createModelConnections(
  createModelConnectionsRepository(connection.db),
  createPostgresSecretStore(
    connection.db,
    applicationSecretKeyProvider("browser-fixture-model-encryption-key"),
  ),
  model.connectionTransport,
);
const conversationModels = modelConnections.models(model.models);
const agentApprovals = createApprovalsService(
  createApprovalsRepository(connection.db),
  model.models.reviewModel ? { reviewModel: model.models.reviewModel } : {},
);
const spaceMemory = createSpaceMemoryService(createSpaceMemoryRepository(connection.db));
const pages = createPagesService(createPagesRepository(connection.db));
const skills = createSkillsService(createSkillsRepository(connection.db));
const mcpServers = createMcpServers(
  createMcpServersRepository(connection.db),
  applicationSecretKeyProvider("browser-fixture-mcp-encryption-key"),
  createMcpTransport(),
);
const openApiServers = createOpenApiServers(
  createOpenApiServersRepository(connection.db),
  applicationSecretKeyProvider("browser-fixture-api-encryption-key"),
  createOpenApiTransport(),
);
const protectedKeys = applicationSecretKeyProvider("browser-fixture-protected-encryption");
const protectedInputs = createProtectedInputsService(connection.db, {
  seal: (binding, value) => sealStoredSecret(protectedKeys, "protected-input", binding, value),
  open: (binding, sealed) => openStoredSecret(protectedKeys, "protected-input", binding, sealed),
});
const protectedValues = () => [
  ...modelConnections.protectedValues(),
  ...mcpServers.protectedValues(),
  ...openApiServers.protectedValues(),
];
const conversationRepository = createConversationsRepository(connection.db);
const computerQueue = createComputerUseQueue(connection.db);
const runner = new ConversationRunner(
  conversationRepository,
  conversationModels,
  undefined,
  undefined,
  {
    tools: withOpenApiTools(
      withMcpTools(
        withSkillTools(
          withPageTools(
            withMemoryTools(
              withDeviceComputerTools(
                createComputerTools(
                  computers,
                  computerProvider,
                  [],
                  conversationRepository.pinResources,
                  computerQueue,
                  {
                    withAgentInput: computerScreens.withAgentInput,
                    setPaused: (scope, run, paused) =>
                      conversationRepository.setComputerInputPaused!(scope, run, paused),
                  },
                ),
                deviceComputersRepository,
                deviceConnector,
                conversationRepository.pinResources,
                computerQueue,
                protectedValues,
              ),
              spaceMemory,
              protectedValues,
            ),
            pages,
            protectedValues,
          ),
          skills,
          protectedValues,
        ),
        mcpServers,
        protectedValues,
      ),
      openApiServers,
      protectedValues,
    ),
    approvals: agentApprovals,
    protectedInputs,
  },
  {
    recallMemory: (scope, run) => spaceMemory.recall(scope, run.agentId),
    loadSkills: (scope, run) => skills.runCatalog(scope, run.agentId),
  },
);
const spaceManagement = createSpaceManagement(connection.db, {
  reviewModelAvailable: () => model.models.reviewModel?.available() ?? false,
  beforeMemberRemoved: async (tx, spaceId, accountId) => {
    await revokeComputerScreenControl(tx, spaceId, accountId);
    await cancelSpaceRuns(tx, spaceId, accountId);
  },
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
  screens: computerScreens,
});
await stream.start();
const app = createApiApp({
  authHandler: (request) => auth.handler(request),
  readSession,
  allowedOrigins: ["http://127.0.0.1:4173", "http://127.0.0.1:4174"],
  config,
  computers,
  computerScreens,
  deviceComputers,
  deviceConnector,
  modelConnections,
  agentApprovals,
  protectedInputs,
  routines,
  spaceMemory,
  pages,
  skills,
  mcpServers,
  openApiServers,
  spaces,
  spaceManagement,
  agents: createAgentsRepository(connection.db),
  conversationModels,
  conversations: runner.conversations,
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
  | { id: string; kind: "device-connector"; credential: string; opening?: Promise<void> }
  | { id: string; kind: "conversation"; accountId: string; headers: Headers };
const server = serve<SocketData>({
  hostname: "127.0.0.1",
  port,
  async fetch(request, listener) {
    const path = new URL(request.url).pathname;
    // Browser-mocked shell journeys intentionally start with unavailable SSR
    // account data, then hydrate from their own HTTP fixtures. Keep that explicit
    // failure injection deterministic when this owned API is also reachable.
    if (
      path === "/rpc/account/get" &&
      request.headers
        .get("cookie")
        ?.split(";")
        .some((value) => value.trim() === "better-auth.session_token=browser-fixture-only")
    )
      return new Response(null, { status: 503 });
    if (path === "/fixture/mcp") return fixtureMcpResponse(request);
    if (path === "/fixture/httpapi" || path.startsWith("/fixture/httpapi/"))
      return openApiResponse(request);
    if (path === "/fixture/device/pair" || path === "/fixture/device/status") {
      const origin = request.headers.get("origin");
      if (!origin || !["http://127.0.0.1:4173", "http://127.0.0.1:4174"].includes(origin))
        return new Response(null, { status: 403 });
      const session = await readSession(request.headers);
      if (!session || !accountEmails.includes(session.user.email))
        return new Response(null, { status: 401 });
      return browserDevices.handle(request, session.user.id);
    }
    if (path === "/device/connect") {
      // The test listener owns Bun upgrades; production owns the same registry
      // through its CrossWS adapter. Possession headers never enter public output.
      const authorization = request.headers.get("authorization");
      if (request.headers.has("origin") || !authorization?.startsWith("Bearer "))
        return new Response(null, { status: 403 });
      const credential = authorization.slice(7);
      try {
        await deviceComputersRepository.authenticate(credential);
      } catch {
        return new Response(null, { status: 401 });
      }
      if (
        listener.upgrade(request, {
          data: { id: crypto.randomUUID(), kind: "device-connector", credential },
        })
      )
        return;
      return new Response(null, { status: 426 });
    }
    if (
      path === "/events" ||
      path === "/fixture/conversation/complete" ||
      path === "/fixture/conversation/history" ||
      path === "/fixture/conversation/transcript"
    ) {
      const origin = request.headers.get("origin");
      if (origin && !["http://127.0.0.1:4173", "http://127.0.0.1:4174"].includes(origin))
        return new Response(null, { status: 403 });
      const session = await readSession(request.headers);
      if (!session) return new Response(null, { status: 401 });
      if (path === "/fixture/conversation/transcript") {
        if (request.method !== "POST" || !accountEmails.includes(session.user.email))
          return new Response(null, { status: 403 });
        const input = (await request.json()) as { spaceId: string; conversationId: string };
        const scope = await spaces.resolve(session.user.id, spaceIdSchema.parse(input.spaceId));
        await conversationRepository.snapshot(scope, input.conversationId as ConversationId);
        return Response.json(model.transcript(input.conversationId));
      }
      if (path === "/fixture/conversation/history") {
        if (request.method !== "POST") return new Response(null, { status: 405 });
        if (!accountEmails.includes(session.user.email)) return new Response(null, { status: 403 });
        try {
          const input: unknown = await request.json();
          if (!input || typeof input !== "object") return new Response(null, { status: 400 });
          if (!("spaceId" in input) || !("conversationId" in input))
            return new Response(null, { status: 400 });
          if (
            !("count" in input) ||
            typeof input.count !== "number" ||
            !Number.isInteger(input.count) ||
            input.count < 1 ||
            input.count > 300 ||
            !("prefix" in input) ||
            typeof input.prefix !== "string" ||
            !input.prefix ||
            input.prefix.length > 100
          )
            return new Response(null, { status: 400 });
          const spaceId = spaceIdSchema.parse(input.spaceId);
          const conversationId = conversationIdSchema.parse(input.conversationId);
          const scope = await spaces.resolve(session.user.id, spaceId);
          await runner.conversations.snapshot(scope, conversationId);
          const messages = await seedBrowserHistory(
            connection.db,
            scope,
            conversationId,
            session.user.name,
            input.count,
            input.prefix,
            "append" in input && input.append === true,
          );
          if (!messages) return new Response(null, { status: 409 });
          return Response.json({ messages });
        } catch {
          return new Response(null, { status: 400 });
        }
      }
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
    return app.fetch(request);
  },
  websocket: {
    open(socket) {
      if (socket.data.kind === "device-connector") {
        socket.data.opening = deviceConnector
          .open(socket.data.id, socket.data.credential, {
            send(frame) {
              socket.send(JSON.stringify(frame));
            },
            close(code, reason) {
              socket.close(code, reason);
            },
          })
          .catch(() => {
            socket.close(4003, "Access denied");
          });
        return;
      }
      if (socket.data.kind === "conversation") {
        stream.open(socket.data.id, socket.data.accountId, socket.data.headers, {
          send: (frame) => {
            socket.send(JSON.stringify(frame));
          },
          close: (code, reason) => socket.close(code, reason),
        });
        return;
      }
    },
    message(socket, value) {
      if (socket.data.kind === "device-connector") {
        const data = socket.data;
        if (typeof value === "string")
          void data.opening?.then(() => deviceConnector.receive(data.id, value));
        return;
      }
      if (socket.data.kind === "conversation") {
        if (typeof value === "string") stream.receive(socket.data.id, value);
        return;
      }
    },
    close(socket) {
      if (socket.data.kind === "device-connector") {
        const data = socket.data;
        void data.opening?.then(() => deviceConnector.close(data.id));
        return;
      }
      if (socket.data.kind === "conversation") {
        stream.close(socket.data.id);
        return;
      }
    },
  },
});
console.log(`Control browser fixture ready on 127.0.0.1:${port}`);
const stop = async () => {
  await browserDevices.close();
  await deviceConnector.shutdown();
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
