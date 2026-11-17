/** Explicit real-backend browser fixture. Never imported by production routes. */
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { serve } from "bun";
import { user, schema, spaces as spaceRows, spaceDeletionJobs } from "@raypx/database/schema";
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
  createMessageAttachmentsService,
  createMemberNotificationsService,
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
import { WEATHER_API_URL, WEB_SEARCH_API_URL } from "@raypx/core/openapi-servers";
import { createMcpServers } from "../../src/conversations/mcp-servers.js";
import { createMcpServersRepository } from "../../src/conversations/mcp-postgres.js";
import { withPageTools } from "../../src/conversations/page-tools.js";
import { withBrowserTools } from "../../src/conversations/browser-tools.js";
import { createBrowserProvider } from "@raypx/providers/browser";
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
import { createConversationSocketRoutes } from "../../src/conversations/socket.js";
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
  createDeviceMemberFilesRepository,
  createDeviceMemberFilesService,
} from "@raypx/computers/server/postgres";
import { withDeviceComputerTools } from "../../src/conversations/device-tools.js";
import { browserDeviceFixture } from "./browser-devices.js";
import { createMemoryComputerProvider } from "@raypx/providers/computer";
import { AuditService } from "../../src/admin/audit.js";
import { createAdministrationRepository } from "../../src/admin/repository.js";
import { createConfigRepository } from "../../src/config/repository.js";
import { createConfigService } from "../../src/config/service.js";
import { createAccessPolicy } from "../../src/access.js";
import { getApiEnvironment } from "../../src/env.js";
import { createAuthConfig } from "../../src/runtime/adapters.js";
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
const environment = getApiEnvironment({
  NODE_ENV: "test",
  DATABASE_URL: url,
  PUBLIC_URL: process.env.PUBLIC_URL ?? "http://127.0.0.1:4173",
  API_PUBLIC_URL: process.env.API_PUBLIC_URL ?? `http://127.0.0.1:${port}`,
  EXTRA_ALLOWED_ORIGINS: process.env.EXTRA_ALLOWED_ORIGINS ?? "http://127.0.0.1:4174",
});
const { allowedOrigins } = environment;
await connection.db.delete(user).where(inArray(user.email, accountEmails));
const auth = createAuth({
  database: drizzleAdapter(connection.db, { provider: "pg", schema }),
  config: {
    ...createAuthConfig(environment),
    secret: "raypx-browser-fixture-secret-32-characters",
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
const memberFiles = createDeviceMemberFilesRepository(connection.db, `http://127.0.0.1:${port}`);
const deviceConnector = createDeviceConnectorRegistry(
  deviceComputersRepository,
  undefined,
  memberFiles,
);
const deviceFiles = createDeviceMemberFilesService(deviceConnector);
const messageAttachments = createMessageAttachmentsService(connection.db);
const notifications = createMemberNotificationsService(connection.db);
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
const openApiTransport = createOpenApiTransport();
const webFixtureTransport = createOpenApiTransport({
  resolver: async () => [{ address: "93.184.216.34", family: 4 }],
  async request(endpoint, method, headers, body) {
    const expected = headers.authorization === "Bearer fixture-tavily-key";
    let output: unknown = { error: "fixture request rejected" };
    let status = expected && endpoint.url.origin === WEB_SEARCH_API_URL ? 200 : 401;
    if (status === 200) {
      const input = body ? JSON.parse(body) : null;
      if (method === "GET" && endpoint.url.pathname === "/usage") output = {};
      else if (
        method === "POST" &&
        endpoint.url.pathname === "/search" &&
        input?.query === "fixture public web sources"
      )
        output = {
          results: [
            {
              title: "Fixture documentation",
              url: "https://docs.example.com/start",
              content: "Search excerpt.",
            },
            {
              title: "Fixture reference",
              url: "https://docs.example.com/reference",
              content: "Reference excerpt.",
            },
          ],
        };
      else if (
        method === "POST" &&
        endpoint.url.pathname === "/extract" &&
        input?.urls?.[0] === "https://docs.example.com/start"
      )
        output = {
          results: [
            {
              url: "https://docs.example.com/start",
              raw_content: "Verified document excerpt.",
            },
          ],
        };
      else status = 400;
    }
    return { status, headers: new Headers(), body: JSON.stringify(output) };
  },
});
const weatherFixtureTransport = createOpenApiTransport({
  now: () => new Date("2026-08-09T17:30:00Z"),
  resolver: async () => [{ address: "93.184.216.34", family: 4 }],
  async request({ url: endpoint }, method) {
    const input = endpoint.searchParams;
    let response: unknown;
    if (
      method === "GET" &&
      endpoint.hostname === "geocoding-api.open-meteo.com" &&
      endpoint.pathname === "/v1/search"
    ) {
      const city = input.get("name");
      if (city === "上海")
        response = {
          results: [
            {
              name: "上海",
              country: "中国",
              latitude: 31.23,
              longitude: 121.47,
              timezone: "Asia/Shanghai",
            },
          ],
        };
      if (city === "Berlin, Germany")
        response = {
          results: [
            {
              name: "Berlin",
              country: "Germany",
              latitude: 52.52,
              longitude: 13.41,
              timezone: "Europe/Berlin",
            },
          ],
        };
    }
    if (
      method === "GET" &&
      endpoint.origin === WEATHER_API_URL &&
      endpoint.pathname === "/v1/forecast"
    ) {
      const date = input.get("start_date");
      const validDate = input.get("timezone") === "Asia/Shanghai" ? "2026-08-11" : "2026-08-09";
      if (date === validDate && input.get("end_date") === date)
        response = {
          daily: {
            time: [date],
            weather_code: [61],
            temperature_2m_min: [22],
            temperature_2m_max: [29],
            precipitation_probability_max: [80],
          },
          hourly: {
            time: [`${date}T08:00`, `${date}T17:00`],
            temperature_2m: [23, 28],
            weather_code: [2, 61],
            precipitation_probability: [15, 80],
          },
        };
    }
    return {
      status: response ? 200 : 400,
      headers: new Headers(),
      body: JSON.stringify(response ?? { error: true }),
    };
  },
});
function fixtureTransport(endpoint: string) {
  if (endpoint === WEB_SEARCH_API_URL) return webFixtureTransport;
  if (endpoint === WEATHER_API_URL) return weatherFixtureTransport;
  return openApiTransport;
}
const openApiServers = createOpenApiServers(
  createOpenApiServersRepository(connection.db),
  applicationSecretKeyProvider("browser-fixture-api-encryption-key"),
  {
    ...openApiTransport,
    test: (...args) => fixtureTransport(args[0]).test(...args),
    call: (...args) => fixtureTransport(args[0]).call(...args),
  },
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
const browserEndpoint = process.env.CONTROL_E2E_BROWSER_ENDPOINT;
const browserToken = process.env.CONTROL_E2E_BROWSER_TOKEN;
const browser =
  browserEndpoint && browserToken
    ? createBrowserProvider(browserEndpoint, browserToken, environment.APP_KEY)
    : undefined;
const fixtureTools = withOpenApiTools(
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
        { publicWebOrigin: environment.publicWebOrigin, secrets: protectedValues },
      ),
      skills,
      protectedValues,
    ),
    mcpServers,
    protectedValues,
  ),
  openApiServers,
  protectedValues,
);
const runner = new ConversationRunner(
  conversationRepository,
  conversationModels,
  undefined,
  undefined,
  {
    tools: browser ? withBrowserTools(fixtureTools, browser, protectedValues) : fixtureTools,
    approvals: agentApprovals,
    attachments: messageAttachments,
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
  browser,
  messageAttachments,
  deviceFiles,
  notifications,
  authHandler: (request) => auth.handler(request),
  readSession,
  allowedOrigins,
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
app.route("/api/events", createConversationSocketRoutes({ stream, allowedOrigins, readSession }));
for (const account of accounts) {
  const signup = await app.fetch(
    new Request(`http://127.0.0.1:${port}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: environment.publicWebOrigin },
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
      path === "/api/rpc/account/get" &&
      request.headers
        .get("cookie")
        ?.split(";")
        .some((value) => value.trim() === "better-auth.session_token=browser-fixture-only")
    )
      return new Response(null, { status: 503 });
    if (path === "/fixture/mcp") return fixtureMcpResponse(request);
    if (path === "/fixture/httpapi" || path.startsWith("/fixture/httpapi/"))
      return openApiResponse(request);
    if (
      path === "/fixture/device/pair" ||
      path === "/fixture/device/status" ||
      path === "/fixture/device/offline"
    ) {
      const origin = request.headers.get("origin");
      if (!origin || !allowedOrigins.includes(origin)) return new Response(null, { status: 403 });
      const session = await readSession(request.headers);
      if (!session || !accountEmails.includes(session.user.email))
        return new Response(null, { status: 401 });
      return browserDevices.handle(request, session.user.id);
    }
    if (path === "/api/device/connect") {
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
    // Use the production HTTP feed. This Bun fixture still owns native WebSocket upgrades.
    if (path === "/api/events" && request.headers.get("upgrade")?.toLowerCase() !== "websocket")
      return app.fetch(request);
    if (
      path === "/api/events" ||
      path === "/fixture/conversation/complete" ||
      path === "/fixture/conversation/history" ||
      path === "/fixture/conversation/transcript"
    ) {
      const origin = request.headers.get("origin");
      if (origin && !allowedOrigins.includes(origin)) return new Response(null, { status: 403 });
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
  // The fixture has no deletion worker. Drain only deletion claims requested by
  // its seeded accounts so repeated acceptance cannot starve unrelated test jobs.
  await connection.db.delete(spaceRows).where(
    inArray(
      spaceRows.id,
      connection.db
        .select({ id: spaceDeletionJobs.spaceId })
        .from(spaceDeletionJobs)
        .where(
          inArray(
            spaceDeletionJobs.requestedByAccountId,
            connection.db
              .select({ id: user.id })
              .from(user)
              .where(inArray(user.email, accountEmails)),
          ),
        ),
    ),
  );
  await connection.db.delete(user).where(inArray(user.email, accountEmails));
  await connection.close();
  process.exit(0);
};
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
