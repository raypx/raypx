import type { ApiAppOptions } from "../../src/app/options.js";
import { createApiApp as createApp } from "../../src/routers/index.js";
import { createRpcRouter as createRouter } from "../../src/routers/rpc/index.js";
import type { ReadReadiness } from "../../src/app/readiness.js";

const services = [
  "deviceComputers",
  "deviceConnector",
  "pages",
  "skills",
  "mcpServers",
  "openApiServers",
  "routines",
  "spaceMemory",
  "modelConnections",
  "agentApprovals",
  "protectedInputs",
  "computers",
  "computerScreens",
  "spaces",
  "spaceManagement",
  "agents",
  "conversations",
  "conversationModels",
  "administration",
  "config",
  "storageSettings",
  "resendSettings",
] as const satisfies readonly (keyof ApiAppOptions)[];

/** A service the test did not supply fails loudly at its first use, not as a 503. */
function absent(name: string) {
  return new Proxy(
    {},
    {
      get(_, property) {
        throw new Error(`Test application has no ${name}: ${String(property)} was used`);
      },
    },
  );
}

export type TestAppOptions = Partial<ApiAppOptions>;

/** Complete application options from the few a test cares about. */
export function testAppOptions(overrides: TestAppOptions = {}): ApiAppOptions {
  const missing = Object.fromEntries(
    services.filter((name) => !overrides[name]).map((name) => [name, absent(name)]),
  );
  return {
    authHandler: async () => new Response(null),
    readSession: async () => null,
    allowedOrigins: [],
    ...(missing as Pick<ApiAppOptions, (typeof services)[number]>),
    ...overrides,
  };
}

export function createApiApp(overrides: TestAppOptions = {}) {
  return createApp(testAppOptions(overrides));
}

export function createRpcRouter(overrides: TestAppOptions, readReadiness: ReadReadiness) {
  return createRouter(testAppOptions(overrides), readReadiness);
}
