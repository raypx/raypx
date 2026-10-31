import {
  chmodSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import { z } from "zod";

import { taskText } from "@raypx/core/task-text";
import { type AgentProvider } from "@raypx/core/tasks";
import {
  terminalDecisionSchema,
  terminalSessionSchema,
  type TerminalRequest,
  type TerminalSession,
} from "@raypx/contracts/terminal";
import { RequestBroker } from "./broker";
import { TerminalStore } from "./store";
import { hookDecision, parseHookInvocation, terminalCapabilities } from "./protocol";
import { acquireLock } from "../state";
import { LocalError } from "../errors";
import { privateSocketDirectory } from "./socket";
import {
  foreignLoopbackRequest,
  localAddressSchema,
  localFetch,
  loopbackTransport,
  type LocalAddress,
} from "../local-http";

const terminalEndpointSchema = z
  .object({
    version: z.literal(1),
    epoch: z.string().uuid(),
    ownerToken: z.string().min(64),
    hookToken: z.string().min(64),
  })
  .and(localAddressSchema);
export type TerminalEndpoint = z.infer<typeof terminalEndpointSchema>;
export function readTerminalEndpoint(directory: string): TerminalEndpoint {
  return terminalEndpointSchema.parse(
    JSON.parse(readFileSync(join(directory, "terminal-host.json"), "utf8")),
  );
}
const decisionInput = z.object({ id: z.string().uuid(), epoch: z.string().uuid() });

/** Private hook endpoint; never exposes the daemon's local method router. */
type TerminalOptions = {
  directory: string;
  projects: string[];
  projectIds?: ReadonlyMap<string, string>;
  discoveryDirectory?: string;
  reachable?: (request?: TerminalRequest, session?: TerminalSession) => boolean;
  admitted?: (request: TerminalRequest, session: TerminalSession) => void;
  setAway?: (enabled: boolean) => void;
  lockDirectory?: string;
  authorizeProject?: (path: string, provider: AgentProvider) => boolean;
  ignoreSession?: (provider: AgentProvider, sessionId: string) => boolean;
  away?: boolean;
  waitSeconds?: number;
  changed?: (request: TerminalRequest) => void;
};
export function startTerminalHost(options: TerminalOptions) {
  if (
    options.waitSeconds !== undefined &&
    (!Number.isInteger(options.waitSeconds) ||
      options.waitSeconds < 60 ||
      options.waitSeconds > 600)
  )
    throw new LocalError("INVALID_WAIT", "Away wait must be between 60 and 600 seconds");
  let projects = options.projects.map((path) => {
    if (!isAbsolute(path))
      throw new LocalError("INVALID_PROJECT", "Terminal projects must use absolute paths");
    return realpathSync(path);
  });
  mkdirSync(options.directory, { recursive: true, mode: 0o700 });
  const unlock = acquireLock(options.lockDirectory ?? options.directory, "terminal-host");
  if (!unlock) throw new LocalError("HOST_RUNNING", "A terminal host already owns this profile");
  let store: TerminalStore | undefined;
  let socketDirectory: string | undefined;
  let server: ReturnType<typeof Bun.serve> | undefined;
  try {
    store = new TerminalStore(options.directory);
    const broker = new RequestBroker(store, options.changed);
    const sessions = new Map<string, TerminalSession>(store.sessions());
    let previous: string | undefined;
    try {
      previous = readTerminalEndpoint(options.directory).socket;
    } catch {
      /* First startup. */
    }
    if (!loopbackTransport())
      socketDirectory = privateSocketDirectory(options.directory, "terminal", previous);
    const identity = {
      version: 1 as const,
      epoch: broker.epoch,
      ownerToken: crypto.randomUUID() + crypto.randomUUID(),
      hookToken: crypto.randomUUID() + crypto.randomUUID(),
    };
    // A loopback port is known only after binding; endpoints are published afterwards.
    let address: LocalAddress = socketDirectory
      ? { socket: join(socketDirectory, "host.sock") }
      : { port: 1 };
    let endpoint: TerminalEndpoint = { ...identity, ...address };
    let away = options.away ?? false,
      viewerUntil = 0;
    server = Bun.serve({
      ...(address.socket === undefined
        ? { hostname: "127.0.0.1", port: 0 }
        : { unix: address.socket }),
      maxRequestBodySize: 256 * 1024,
      fetch: async (request, transport) => {
        transport.timeout(request, 0);
        if (foreignLoopbackRequest(request, address)) return new Response(null, { status: 403 });
        const path = new URL(request.url).pathname;
        const owner = request.headers.get("authorization") === `Bearer ${endpoint.ownerToken}`;
        const hook = request.headers.get("authorization") === `Bearer ${endpoint.hookToken}`;
        if (!owner && !hook) return new Response(null, { status: 403 });
        try {
          if (hook && path === "/ready" && request.method === "GET")
            return Response.json({ epoch: broker.epoch });
          if (owner && path === "/state" && request.method === "GET") {
            const latest = new Map(
              [...broker.pendingRequests(), ...broker.list()].map((value) => [value.id, value]),
            );
            const requests = [...latest.values()].map(
              ({ body: _body, questions: _questions, decision: _decision, ...summary }) => summary,
            );
            return Response.json({
              version: 1,
              epoch: broker.epoch,
              away,
              sessions: [...sessions.values()],
              requests,
            });
          }
          if (owner && path === "/request" && request.method === "POST") {
            const input = z.object({ id: z.string().uuid() }).parse(await request.json());
            const value = broker.get(input.id);
            return value ? Response.json(value) : new Response(null, { status: 404 });
          }
          if (owner && path === "/decision" && request.method === "POST")
            return Response.json(broker.decide(terminalDecisionSchema.parse(await request.json())));
          if (owner && path === "/watch" && request.method === "POST" && !options.reachable) {
            const input = z.object({ active: z.boolean() }).parse(await request.json());
            viewerUntil = input.active ? Date.now() + 15_000 : 0;
            return Response.json({ active: input.active });
          }
          if (owner && path === "/away" && request.method === "POST") {
            const input = z.object({ enabled: z.boolean() }).parse(await request.json());
            if (!options.setAway)
              throw new LocalError(
                "INVALID_METHOD",
                "Configure Away through the owning settings service",
              );
            options.setAway(input.enabled);
            return Response.json({ away });
          }
          if (hook && path === "/delivered" && request.method === "POST") {
            const input = decisionInput.parse(await request.json());
            return Response.json({ delivered: broker.delivered(input.id, input.epoch) });
          }
          if (hook && path === "/hook" && request.method === "POST") {
            const raw = z
              .object({ provider: z.enum(["claude", "codex"]), input: z.unknown() })
              .parse(await request.json());
            const invocation = parseHookInvocation(raw.provider, raw.input);
            if (
              !invocation ||
              options.ignoreSession?.(invocation.provider, invocation.providerSessionId)
            )
              return Response.json({ fallback: true });
            if (!away) return Response.json({ fallback: true });
            const directory = realpathSync(invocation.cwd);
            const project = projects.find((root) => {
              const subpath = relative(root, directory);
              return (
                subpath === "" ||
                (subpath !== ".." && !subpath.startsWith(`..${sep}`) && !isAbsolute(subpath))
              );
            });
            if (!project) return Response.json({ fallback: true });
            if (options.authorizeProject && !options.authorizeProject(project, invocation.provider))
              return Response.json({ fallback: true });
            const projectId = options.projectIds?.get(project) ?? store!.projectId(project);
            const key = createHash("sha256")
              .update(
                JSON.stringify([invocation.provider, invocation.providerSessionId, projectId]),
              )
              .digest("hex");
            let session = sessions.get(key);
            if (!session) {
              if (sessions.size >= 1024) return Response.json({ fallback: true });
              session = terminalSessionSchema.parse({
                id: crypto.randomUUID(),
                provider: invocation.provider,
                providerSessionId: invocation.providerSessionId,
                projectId,
                projectName: taskText(basename(project), 120),
                capabilities: terminalCapabilities(invocation.provider),
              });
              sessions.set(key, session);
              store!.session(key, session);
            }
            const pending = broker.open(
              {
                sessionId: session.id,
                provider: invocation.provider,
                kind: invocation.kind,
                title: invocation.tool,
                body: invocation.body,
                questions: invocation.questions,
              },
              {
                away,
                reachable: options.reachable?.(undefined, session) ?? viewerUntil > Date.now(),
                admitted: (value) => options.admitted?.(value, session),
                ...(options.waitSeconds === undefined ? {} : { waitSeconds: options.waitSeconds }),
                signal: request.signal,
              },
            );
            // Opening can evict the last old request for this same session.
            // Persist it again after the new request owns the reference.
            if (pending.request) store!.session(key, session);
            const retained = new Set(broker.list(256).map((value) => value.sessionId));
            for (const [sessionKey, value] of sessions)
              if (!retained.has(value.id)) sessions.delete(sessionKey);
            const outcome = await pending.outcome;
            if (outcome.type === "fallback" || !pending.request)
              return Response.json({ fallback: true });
            const output = hookDecision(invocation, outcome.decision);
            return Response.json(
              output === undefined
                ? { fallback: true }
                : {
                    decision: outcome.decision,
                    id: pending.request.id,
                    epoch: pending.request.epoch,
                  },
            );
          }
          return new Response(null, { status: 404 });
        } catch (error) {
          return Response.json(
            { code: error instanceof LocalError ? error.code : "TERMINAL_REQUEST_FAILED" },
            { status: 400 },
          );
        }
      },
    });
    if (address.socket === undefined) {
      address = { port: server.port! };
      endpoint = { ...identity, ...address };
    } else chmodSync(address.socket, 0o600);
    const file = join(options.directory, "terminal-host.json");
    const temporary = `${file}.${broker.epoch}.tmp`;
    writeFileSync(temporary, JSON.stringify(endpoint), { flag: "wx", mode: 0o600 });
    renameSync(temporary, file);
    const discoveryDirectory = options.discoveryDirectory ?? options.directory;
    mkdirSync(discoveryDirectory, { recursive: true, mode: 0o700 });
    const hookFile = join(discoveryDirectory, "terminal-hook.json");
    const hookTemporary = `${hookFile}.${broker.epoch}.tmp`;
    writeFileSync(
      hookTemporary,
      JSON.stringify({
        version: 1,
        epoch: endpoint.epoch,
        ...address,
        token: endpoint.hookToken,
      }),
      { flag: "wx", mode: 0o600 },
    );
    renameSync(hookTemporary, hookFile);
    const watchdog = setInterval(() => {
      for (const request of broker.pendingRequests()) {
        if (options.reachable?.(request) ?? viewerUntil > Date.now()) continue;
        try {
          broker.cancel(request.id, "unavailable");
        } catch {
          /* Waiters have already been released. */
        }
      }
    }, 1000);
    watchdog.unref();
    let closed = false;
    return {
      broker,
      endpoint,
      projectNames: projects.map((project) => basename(project)),
      sessions: () => [...sessions.values()].map((value) => structuredClone(value)),
      configure(
        next: Pick<
          TerminalOptions,
          "projects" | "projectIds" | "away" | "waitSeconds" | "authorizeProject"
        >,
      ) {
        const wait = next.waitSeconds ?? 300;
        if (!Number.isInteger(wait) || wait < 60 || wait > 600)
          throw new LocalError("INVALID_WAIT", "Away wait must be between 60 and 600 seconds");
        const paths = next.projects.map((path) => {
          if (!isAbsolute(path))
            throw new LocalError("INVALID_PROJECT", "Terminal projects must use absolute paths");
          return realpathSync(path);
        });
        options = { ...options, ...next };
        projects = paths;
        away = next.away ?? false;
        for (const request of broker.pendingRequests()) {
          const session = [...sessions.values()].find((value) => value.id === request.sessionId);
          const path = session
            ? projects.find(
                (value) =>
                  (options.projectIds?.get(value) ?? store!.projectId(value)) === session.projectId,
              )
            : undefined;
          if (
            !away ||
            !path ||
            (options.authorizeProject && !options.authorizeProject(path, request.provider))
          )
            broker.cancel(request.id, away ? "unavailable" : "away_off");
        }
      },
      async close() {
        if (closed) return;
        closed = true;
        clearInterval(watchdog);
        try {
          broker.close();
        } finally {
          await server!.stop(true);
          store!.close();
          try {
            if (readTerminalEndpoint(options.directory).epoch === endpoint.epoch) {
              rmSync(file, { force: true });
            }
            if (JSON.parse(readFileSync(hookFile, "utf8")).epoch === endpoint.epoch)
              rmSync(hookFile, { force: true });
          } catch {
            /* Another startup or removed metadata is not ours to delete. */
          }
          if (socketDirectory) rmSync(socketDirectory, { recursive: true, force: true });
          unlock();
        }
      },
    };
  } catch (error) {
    void server?.stop(true);
    store?.close();
    if (socketDirectory) rmSync(socketDirectory, { recursive: true, force: true });
    unlock();
    throw error;
  }
}

export async function terminalFetch(
  endpoint: TerminalEndpoint,
  role: "owner" | "hook",
  path: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  return localFetch(endpoint, path, {
    headers: {
      authorization: `Bearer ${role === "owner" ? endpoint.ownerToken : endpoint.hookToken}`,
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });
}
