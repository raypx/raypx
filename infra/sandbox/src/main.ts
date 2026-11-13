import { sandboxConfig } from "./config.js";
import { socketEngine } from "./engine.js";
import { diskStore } from "./store.js";
import { createSupervisor } from "./supervisor.js";
import { supervisorHandler } from "./http.js";
const config = sandboxConfig(process.env);
const provider = createSupervisor(
  config,
  socketEngine(config.socket),
  diskStore(config.stateDirectory),
);
Bun.serve({
  hostname: config.address,
  port: config.port,
  maxRequestBodySize: 64 * 1024 * 1024,
  idleTimeout: 0,
  fetch: supervisorHandler(provider, config.token),
});
