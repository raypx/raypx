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
const server = Bun.serve({
  hostname: config.address,
  port: config.port,
  maxRequestBodySize: 64 * 1024 * 1024,
  idleTimeout: 0,
  fetch: supervisorHandler(provider, config.token),
});
async function shutdown(code = 0) {
  clearInterval(timer);
  await server.stop(true);
  process.exit(code);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
