import {
  getApiEnvironment,
  getRelayEnvironment,
  getServerRole,
  getWorkerEnvironment,
} from "../env.js";
import { createApiRuntime } from "./server.js";
import { createRelayRuntime } from "./relay.js";
import { createWorkerRuntime } from "./worker.js";
import { migrateApiDatabase } from "./migrations.js";

export async function createBackendRuntime(inputs: Record<string, string | undefined>) {
  const role = getServerRole(inputs);
  if (role === "relay")
    return { role: "relay" as const, ...(await createRelayRuntime(getRelayEnvironment(inputs))) };
  if (role === "worker") {
    const environment = getWorkerEnvironment(inputs);
    await migrateApiDatabase(environment);
    const runtime = await createWorkerRuntime(environment);
    try {
      await runtime.start();
      return { role, ...runtime };
    } catch (error) {
      await runtime.close().catch(() => {});
      throw error;
    }
  }
  const environment = getApiEnvironment(inputs);
  const runtime = await createApiRuntime(environment);
  try {
    await runtime.start();
    return { role: environment.SERVER_ROLE, ...runtime };
  } catch (error) {
    await runtime.close().catch(() => {});
    throw error;
  }
}

let runtime: ReturnType<typeof createBackendRuntime> | undefined;
export function getBackendRuntime() {
  return (runtime ??= createBackendRuntime(process.env));
}
export async function closeBackendRuntime() {
  await (await runtime)?.close();
}
