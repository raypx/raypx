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
await provider.initialize();
let checking = false;
const timer = setInterval(() => {
  if (checking) return;
  checking = true;
  void provider
    .maintain()
    .catch(() => {
      console.error('{"event":"sandbox.maintenance_failed"}');
      void shutdown(1);
    })
    .finally(() => {
      checking = false;
    });
}, config.reapMs);
timer.unref();
let networking = false;
const networkTimer = setInterval(() => {
  if (networking) return;
  networking = true;
  void provider
    .maintainNetwork()
    .catch(() => {
      console.error('{"event":"sandbox.network_maintenance_failed"}');
      void shutdown(1);
    })
    .finally(() => {
      networking = false;
    });
}, config.networkPollMs);
networkTimer.unref();
const server = Bun.serve({
  hostname: config.address,
  port: config.port,
  maxRequestBodySize: 64 * 1024 * 1024,
  idleTimeout: 0,
  fetch: supervisorHandler(provider, config.token),
});
async function shutdown(code = 0) {
  clearInterval(timer);
  clearInterval(networkTimer);
  await server.stop(true);
  process.exit(code);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
