import { getApiEnvironment, getRelayEnvironment, getServerRole } from "../env.js";
import { createApiRuntime } from "./server.js";
import { createRelayRuntime } from "./relay.js";

export async function createBackendRuntime(inputs: Record<string, string | undefined>) {
  if (getServerRole(inputs) === "relay")
    return { role: "relay" as const, ...(await createRelayRuntime(getRelayEnvironment(inputs))) };
  const environment = getApiEnvironment(inputs);
  return { role: environment.SERVER_ROLE, ...(await createApiRuntime(environment)) };
}

let runtime: ReturnType<typeof createBackendRuntime> | undefined;
export function getBackendRuntime() {
  return (runtime ??= createBackendRuntime(process.env));
}
export async function closeBackendRuntime() {
  await (await runtime)?.close();
}
