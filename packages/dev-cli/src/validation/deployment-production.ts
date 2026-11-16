import {
  createServer,
  request as proxyRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createConnection, type Socket } from "node:net";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { apiIngress } from "@raypx/tooling/build/deployment";
import { backendPlan } from "./backends.js";
import { Evidence } from "./evidence.js";
import { smokePublicDeployment } from "./deployment-smoke.js";

async function freePort() {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null) });
  const port = server.port!;
  await server.stop(true);
  return port;
}

/** Prepared production artifacts, one selected disposable DB, two owned loopback ingresses. */
export async function smokeLocalProduction(root: string, args: string[]) {
  const { databaseURL } = backendPlan(args);
  if (!databaseURL)
    throw new Error(
      "--local-production requires --database-url for a disposable loopback database",
    );
  const apiPort = await freePort(),
    webPort = await freePort();
  const proxies: ReturnType<typeof createServer>[] = [];
  const sockets = new Set<Socket>();
  const evidence = new Evidence(root, "deployment-production");
  const webArtifact = join(root, "apps/web/.output/server/index.mjs");
  const digest = () =>
    readFile(webArtifact).then((value) => createHash("sha256").update(value).digest("hex"));
  const before = await digest();
  function target(request: IncomingMessage) {
    const path = new URL(request.url!, "http://localhost").pathname;
    const api =
      apiIngress.prefixes.some((prefix) => path.startsWith(prefix)) ||
      apiIngress.paths.some((candidate) => candidate === path);
    const headers = {
      ...request.headers,
      "x-forwarded-host": request.headers.host!,
      "x-forwarded-proto": "http",
    };
    if (path === "/device/connect") delete headers.cookie;
    return { port: api ? apiPort : webPort, headers };
  }
  await evidence.run(async () => {
    try {
      for (let index = 0; index < 2; index++) {
        const proxy = createServer((request: IncomingMessage, response: ServerResponse) => {
          const upstream = proxyRequest(
            {
              hostname: "127.0.0.1",
              ...target(request),
              path: request.url,
              method: request.method,
            },
            (result) => {
              response.writeHead(result.statusCode!, result.headers);
              result.pipe(response);
            },
          );
          upstream.on("error", () => {
            response.writeHead(502);
            response.end();
          });
          request.pipe(upstream);
        });
        proxy.on("connection", (socket) => {
          sockets.add(socket);
          socket.once("close", () => sockets.delete(socket));
        });
        proxy.on("upgrade", (request, socket, head) => {
          const upstreamTarget = target(request);
          const upstream = createConnection(
            { host: "127.0.0.1", port: upstreamTarget.port },
            () => {
              const headers = Object.entries(upstreamTarget.headers)
                .filter((entry) => entry[1] !== undefined)
                .map(
                  ([name, value]) => `${name}: ${Array.isArray(value) ? value.join(", ") : value}`,
                )
                .join("\r\n");
              upstream.write(`${request.method} ${request.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
              if (head.length) upstream.write(head);
              socket.pipe(upstream);
              upstream.pipe(socket);
            },
          );
          sockets.add(upstream);
          upstream.once("close", () => sockets.delete(upstream));
          upstream.on("error", () => socket.destroy());
          socket.on("error", () => upstream.destroy());
          socket.once("close", () => upstream.destroy());
        });
        await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
        proxies.push(proxy);
      }
      const origins = proxies.map(
        (proxy) => `http://127.0.0.1:${(proxy.address() as { port: number }).port}`,
      );
      const common = { PATH: process.env.PATH, HOST: "127.0.0.1" };
      evidence.start("api", [process.execPath, join(root, "apps/api/.output/server/index.mjs")], {
        ...common,
        NODE_ENV: "production",
        PORT: String(apiPort),
        NITRO_PORT: String(apiPort),
        DATABASE_URL: databaseURL,
        DATABASE_MIGRATE_ON_START: "false",
        SERVER_ROLE: "api",
        PUBLIC_URL: origins[0]!.replace("http:", "https:"),
        EXTRA_ALLOWED_ORIGINS: origins.join(","),
        AUTH_SECRET: crypto.randomUUID(),
        APP_KEY: crypto.randomUUID(),
        JOBS_ENABLED: "false",
      });
      evidence.start("web", [process.execPath, webArtifact], {
        ...common,
        NODE_ENV: "production",
        PORT: String(webPort),
        NITRO_PORT: String(webPort),
      });
      const deadline = Date.now() + 20_000;
      for (;;) {
        const ready = await Promise.all(
          [apiPort, webPort].map((port) =>
            fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) }).then(
              (r) => r.ok,
              () => false,
            ),
          ),
        );
        if (ready.every(Boolean)) break;
        if (Date.now() >= deadline)
          throw new Error(`Production services did not start; see ${evidence.directory}`);
        await Bun.sleep(100);
      }
      for (let index = 0; index < origins.length; index++) {
        const origin = origins[index]!;
        await evidence.measure(`public-smoke-${index + 1}`, () => smokePublicDeployment(origin));
        await evidence.measure(`api-owned-404-${index + 1}`, async () => {
          for (const path of ["/page-content/public/bad", "/device/x", "/api/x"]) {
            const response = await fetch(origin + path);
            const body = await response.text();
            if (
              response.status !== 404 ||
              response.headers.get("x-raypx-service") !== "api" ||
              !response.headers.has("content-security-policy") ||
              !response.headers.has("x-content-type-options") ||
              body.includes("Cannot find any route matching")
            )
              throw new Error(`Production API 404 lost its body or headers at ${path}`);
          }
        });
      }
      await evidence.command(
        "browser-public-origins",
        [process.execPath, "run", "--cwd", "e2e", "e2e:deployment"],
        {
          ...process.env,
          RAYPX_DEPLOYMENT_ORIGINS: JSON.stringify(origins),
        },
      );
      if (before !== (await digest()))
        throw new Error("Web production artifact changed during acceptance");
      await writeFile(
        join(evidence.directory, "results.json"),
        JSON.stringify(
          { origins, webArtifactSha256: before, rebuilt: false, passed: true },
          null,
          2,
        ),
      );
    } finally {
      for (const socket of sockets) socket.destroy();
      await Promise.all(
        proxies.map((proxy) => new Promise<void>((resolve) => proxy.close(() => resolve()))),
      );
    }
  });
}
