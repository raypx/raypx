import { createApiClient } from "@voidmix/client";
import type { RunnerCloud } from "./types.js";

export interface DeviceConfiguration {
  apiUrl: string;
  deviceId: string;
  credential: string;
}
export function createRunnerCloud(configuration: DeviceConfiguration): RunnerCloud {
  const url = new URL(configuration.apiUrl);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
  )
    throw new Error("The cloud API requires HTTPS.");
  const client = createApiClient({
    baseUrl: url.origin,
    headers: { authorization: `Bearer ${configuration.credential}` },
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
  });
  return {
    heartbeat: () => client.runner.heartbeat({}),
    claim: () => client.runner.claim({}),
    acknowledge: (input) => client.runner.acknowledge(input),
    append: (input) => client.runner.events.append(input),
    commands: (input) => client.runner.commands.list(input),
    acknowledgeCommand: (input) => client.runner.commands.acknowledge(input),
  };
}
