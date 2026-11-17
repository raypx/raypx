import { isIP } from "node:net";
import { createBrowserBroker } from "./broker.js";
import { browserDriver } from "./driver.js";
import { browserBrokerFetch } from "./http.js";

const token = process.env.RAYPX_BROWSER_BROKER_TOKEN;
const browser = process.env.RAYPX_AGENT_BROWSER_BIN ?? Bun.which("agent-browser");
const hosts = new Set(
  (process.env.RAYPX_BROWSER_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
);
if (
  !token ||
  token.length < 32 ||
  !browser ||
  !hosts.size ||
  [...hosts].some((host) => !/^(?:[a-z0-9][a-z0-9-]*\.)+[a-z][a-z0-9-]*$/.test(host) || isIP(host))
)
  throw new Error(
    "Browser broker requires a token, agent-browser executable and explicit HTTPS hosts",
  );

const broker = createBrowserBroker(
  browserDriver(browser, [...hosts], process.env.RAYPX_BROWSER_CHROME_BIN),
  hosts,
);
const interval = setInterval(() => void broker.sweep(), 10_000);
interval.unref();

const server = Bun.serve({
  hostname: process.env.RAYPX_BROWSER_HOST ?? "127.0.0.1",
  port: Number(process.env.RAYPX_BROWSER_PORT ?? 8091),
  maxRequestBodySize: 75_000,
  idleTimeout: 30,
  fetch: browserBrokerFetch(broker, token),
});
async function stop() {
  clearInterval(interval);
  await server.stop(true);
  await broker.shutdown();
}
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
