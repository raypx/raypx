import { chmodSync, mkdirSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { createRuntime } from "../index.js";
import { profilePath, acquireLock } from "../state/index.js";
import { LocalError, errorPayload } from "../errors.js";
import { privateSocketDirectory } from "../socket.js";
import { foreignLoopbackRequest, loopbackTransport, type LocalAddress } from "../local-http.js";
import { cliInstallation } from "../process/installation.js";
import { runtimeLease } from "../process/lease.js";
import { onShutdown } from "../../transport/shutdown.js";
import { endpointFile, readDaemon, type ProfileOptions } from "./endpoint.js";
import { cliBuild } from "./build.js";
import { DesktopGateway } from "./desktop/gateway.js";
import manifest from "../../../package.json";
export async function startDaemon(options: ProfileOptions = {}) {
  const directory = profilePath(options);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const unlock = acquireLock(directory, "daemon-owner");
  if (!unlock)
    throw new LocalError("HOST_RUNNING", "A Desktop session transport owns this profile");
  let previous: string | undefined;
  try {
    previous = readDaemon(directory).socket;
  } catch {}
  const socketDirectory = loopbackTransport()
    ? undefined
    : privateSocketDirectory(directory, previous);
  const identity = {
    protocol: 1 as const,
    version: manifest.version,
    builtAt: cliBuild.builtAt,
    epoch: crypto.randomUUID(),
    token: crypto.randomUUID() + crypto.randomUUID(),
  };
  let address: LocalAddress = socketDirectory
    ? { socket: join(socketDirectory, "host.sock") }
    : { port: 1 };
  let runtime: ReturnType<typeof createRuntime> | undefined;
  let desktop: DesktopGateway | undefined;
  let server: ReturnType<typeof Bun.serve> | undefined;
  let closing: Promise<void> | undefined;
  let resolveStopped = () => {};
  const stopped = new Promise<void>((resolve) => {
    resolveStopped = resolve;
  });
  const close = () =>
    (closing ??= (async () => {
      try {
        await desktop?.close();
        await runtime?.close();
      } finally {
        await server?.stop(true);
        try {
          if (readDaemon(directory).epoch === identity.epoch)
            rmSync(endpointFile(directory), { force: true });
        } catch {}
        if (socketDirectory) rmSync(socketDirectory, { recursive: true, force: true });
        unlock();
        resolveStopped();
      }
    })());
  try {
    runtime = createRuntime(options);
    desktop = new DesktopGateway(runtime, directory);
    server = Bun.serve({
      ...(address.socket === undefined
        ? { hostname: "127.0.0.1", port: 0 }
        : { unix: address.socket }),
      maxRequestBodySize: 64 * 1024,
      fetch: async (request) => {
        if (foreignLoopbackRequest(request, address)) return new Response(null, { status: 403 });
        const url = new URL(request.url);
        const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
        const native = url.pathname === "/desktop/native";
        if (native ? !desktop!.permitsNative(token) : token !== identity.token)
          return new Response(null, { status: 403 });
        if (!native && url.pathname === "/info" && request.method === "GET")
          return Response.json({
            ...identity,
            token: undefined,
            pid: process.pid,
            owner: "daemon",
            closing: !!closing,
          });
        if (!native && url.pathname === "/stop" && request.method === "POST") {
          setTimeout(() => {
            void close();
          }, 25);
          return Response.json({ stopped: true });
        }
        if (closing) return new Response(null, { status: 503 });
        if (request.method !== "POST" || (!native && url.pathname !== "/desktop"))
          return new Response(null, { status: 404 });
        try {
          const body = await request.text();
          if (Buffer.byteLength(body) > 64 * 1024) return new Response(null, { status: 413 });
          const result = native
            ? await desktop!.native(token, JSON.parse(body), request.signal)
            : await desktop!.administrative(JSON.parse(body));
          return Response.json({
            result: native ? result : Object.assign({}, result, { nativeAddress: address }),
          });
        } catch (error) {
          if (native && !desktop!.permitsNative(token)) return new Response(null, { status: 403 });
          return Response.json({ error: { code: errorPayload(error).code } });
        }
      },
    });
    if (address.socket === undefined) address = { port: server.port! };
    else chmodSync(address.socket, 0o600);
    const endpoint = { ...identity, ...address };
    const file = endpointFile(directory),
      temporary = `${file}.${identity.epoch}.tmp`;
    writeFileSync(temporary, JSON.stringify(endpoint), { flag: "wx", mode: 0o600 });
    renameSync(temporary, file);
    return { endpoint, runtime, desktop, close, stopped };
  } catch (error) {
    await close();
    throw error;
  }
}
export async function runDaemon(options: ProfileOptions) {
  const rejected = () =>
    console.error(JSON.stringify({ operation: "daemon.background", code: "UNHANDLED_REJECTION" }));
  process.on("unhandledRejection", rejected);
  let releaseRuntime: (() => void) | undefined;
  let removeSignals: (() => void) | undefined;
  try {
    const layout = cliInstallation();
    if (process.platform === "win32" && layout.bundled) {
      releaseRuntime = runtimeLease(layout.root);
      if (!releaseRuntime) throw new LocalError("HOST_STOPPING", "Runtime cleanup is in progress");
    }
    const host = await startDaemon(options);
    const stop = () => {
      void host.close().catch(rejected);
    };
    removeSignals = onShutdown(stop);
    await host.stopped;
  } finally {
    removeSignals?.();
    releaseRuntime?.();
    process.off("unhandledRejection", rejected);
  }
}
