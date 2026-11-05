import { Container } from "@cloudflare/containers";
import type { DurableObjectNamespace } from "@cloudflare/workers-types";
import { containerEnvironment, type RelaySecrets } from "./environment.ts";
import { proxyRelay } from "./proxy.ts";

interface Env extends RelaySecrets {
  RELAY: DurableObjectNamespace<RelayContainer>;
}

export class RelayContainer extends Container<Env> {
  override defaultPort = 3003;
  override requiredPorts = [3003];
  override sleepAfter = "10m";
  override envVars = containerEnvironment(this.env);

  override onError(): void {
    throw new Error("Relay container unavailable");
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return proxyRelay(request, env, () => env.RELAY.getByName("relay"));
  },
};
