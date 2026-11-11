import type { ServerWebSocket } from "bun";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  desktopClientFrameSchema,
  desktopExecutionRequests,
  type DesktopChannel,
} from "@raypx/contracts/desktop";
import { localParams, type LocalEvent } from "@raypx/contracts/local";
import { errorPayload, LocalError } from "../../errors.ts";
import type { ExecutionHost } from "../../owner.ts";
import { AwakeClock } from "../awake-clock.ts";
import { abortable } from "../cancellation.ts";
import { serverOrigin } from "../remote/origin.ts";
import { DesktopApi } from "./api.ts";
import { SessionCookies } from "./cookies.ts";
import { DesktopControl } from "./control.ts";
import { encryptedSessionStore, sessionRecordStore } from "./sessions.ts";
import { DesktopExecutions } from "./executions.ts";

const capability = () => crypto.randomUUID() + crypto.randomUUID();
const frameLimit = 8 * 1024 * 1024;
/** Unacknowledged event bytes a renderer may hold; one larger event still travels alone. */
const eventCredit = 1024 * 1024;
/** A renderer that acknowledges nothing for this long while events are outstanding is gone. */
const stallLimit = 10_000;
/** Events a renderer may have outstanding, sent or queued. */
const eventLimit = 1024;
const leaseDuration = 20_000;
const maintenanceInterval = 5000;
const matches = (expected: string, actual: string) => {
  const left = Buffer.from(expected),
    right = Buffer.from(actual);
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
};
const originSchema = z
  .string()
  .max(2048)
  .transform((value) => serverOrigin(value));
const bootstrapSchema = z.strictObject({
  action: z.literal("bootstrap"),
  protocol: z.literal(1),
  ownerId: z.string().regex(/^[a-f0-9]{64}$/),
  apiUrl: originSchema,
  pageOrigin: z
    .string()
    .max(200)
    .refine(
      (value) =>
        /^mygo:\/\/[a-f0-9]{32}$/.test(value) ||
        /^http:\/\/[a-f0-9]{32}\.mygo\.localhost$/.test(value) ||
        value === "http://localhost:1420",
    ),
  configDirs: localParams["connectors.status"].shape.configDirs,
  key: z
    .string()
    .regex(/^[A-Za-z0-9+/]{43}=$/)
    .optional(),
});
const nativeInputSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("channel") }),
  z.strictObject({ action: z.literal("visible"), active: z.boolean() }),
  z.strictObject({ action: z.literal("pick"), path: z.string().min(1).max(4096) }),
  z.strictObject({ action: z.literal("open_approvals"), scope: z.enum(["local", "remote"]) }),
  z.strictObject({ action: z.literal("notifications") }),
  z.strictObject({ action: z.literal("release") }),
  z.strictObject({ action: z.literal("quit_tasks") }),
  z.strictObject({ action: z.literal("stop_quit_tasks"), confirmation: z.uuid() }),
  z.strictObject({ action: z.literal("quit") }),
]);
type Binding = {
  id: string;
  capability: string;
  origin: string;
  owner: string;
  api: DesktopApi;
  pageOrigin: string;
  control: DesktopControl;
  abort: AbortController;
  visible: boolean;
  lease: AbortController;
  ticket?: { capability: string; expires: number };
  quitTasks?: { confirmation: string; ids: string[] };
  expires: number;
  notifications: { revision: number; scope: "local" | "remote" };
};
type Peer = {
  socket?: ServerWebSocket<Peer>;
  binding: Binding;
  abort: AbortController;
  authentication: ReturnType<typeof setTimeout>;
  authenticated: boolean;
  id: string;
  pending: Map<string, AbortController>;
  events: { sequence: number; encoded: string; size: number }[];
  bytes: number;
  sequence: number;
  streamId: string;
  /** Sent events awaiting a cumulative acknowledgement, oldest first. */
  unacked: { sequence: number; size: number }[];
  inflight: number;
  stall: ReturnType<typeof setTimeout> | undefined;
};

/** A distinct loopback listener: administrative IPC is never upgraded or exposed to a page. */
export class DesktopGateway {
  private binding: Binding | undefined;
  private readonly peers = new Set<Peer>();
  private readonly sessions = new Map<string, DesktopApi>();
  private readonly operations = new Set<Promise<unknown>>();
  private readonly apiOperations = new Map<DesktopApi, number>();
  private readonly executions: DesktopExecutions;
  private administrativeQueue = Promise.resolve();
  private readonly server: ReturnType<typeof Bun.serve<Peer>>;
  private readonly maintenance: ReturnType<typeof setInterval>;
  // The native host renews its lease every few seconds. Measuring that lease in awake
  // time keeps a suspended machine from retiring the UI binding.
  private readonly clock = new AwakeClock(maintenanceInterval);
  private closed = false;
  constructor(
    private readonly host: ExecutionHost,
    private readonly directory: string,
  ) {
    this.executions = new DesktopExecutions(host);
    this.server = Bun.serve<Peer>({
      hostname: "127.0.0.1",
      port: 0,
      maxRequestBodySize: 4096,
      fetch: (request, server) => {
        const url = new URL(request.url);
        const binding = this.binding;
        if (
          this.closed ||
          !binding ||
          binding.abort.signal.aborted ||
          this.expired(binding) ||
          request.method !== "GET" ||
          url.pathname !== "/desktop" ||
          url.search ||
          request.headers.get("host") !== `127.0.0.1:${server.port}` ||
          request.headers.get("origin") !== binding.pageOrigin ||
          this.peers.size >= 8
        )
          return new Response(null, { status: 403 });
        const peer: Peer = {
          binding,
          abort: new AbortController(),
          id: crypto.randomUUID(),
          authenticated: false,
          authentication: setTimeout(() => this.release(peer), 5000),
          pending: new Map(),
          events: [],
          bytes: 0,
          sequence: 0,
          streamId: crypto.randomUUID(),
          unacked: [],
          inflight: 0,
          stall: undefined,
        };
        if (!server.upgrade(request, { data: peer })) {
          clearTimeout(peer.authentication);
          return new Response(null, { status: 400 });
        }
        this.peers.add(peer);
        return undefined;
      },
      websocket: {
        maxPayloadLength: frameLimit,
        backpressureLimit: frameLimit,
        closeOnBackpressureLimit: true,
        idleTimeout: 30,
        open: (socket) => {
          socket.data.socket = socket;
        },
        message: (socket, raw) => {
          const peer = socket.data;
          try {
            if (
              typeof raw !== "string" ||
              peer.abort.signal.aborted ||
              this.expired(peer.binding) ||
              (!peer.authenticated && raw.length > 4096)
            )
              return this.release(peer);
            const parsed = desktopClientFrameSchema.safeParse(JSON.parse(raw));
            if (!parsed.success) return this.release(peer);
            const frame = parsed.data;
            if (!peer.authenticated) {
              const ticket = peer.binding.ticket;
              if (
                frame.type !== "authenticate" ||
                !ticket ||
                ticket.expires < Date.now() ||
                !matches(ticket.capability, frame.capability) ||
                peer.binding !== this.binding
              )
                return this.release(peer);
              delete peer.binding.ticket;
              clearTimeout(peer.authentication);
              peer.authenticated = true;
              // The newly authenticated owned page replaces its previous connection.
              for (const previous of this.peers)
                if (previous !== peer && previous.authenticated) this.release(previous);
              this.send(peer, { type: "ready", protocol: 1, streamId: peer.streamId });
              this.enqueue(peer, {
                version: 1,
                event: "engine.status",
                data: { status: "ready", owner: "daemon" },
              });
              void this.updateLease(peer.binding);
              return;
            }
            if (frame.type === "authenticate") return this.release(peer);
            if (frame.type === "ack") {
              this.acknowledge(peer, frame.streamId, frame.sequence);
              return;
            }
            if (frame.type === "cancel") {
              peer.pending.get(frame.id)?.abort();
              return;
            }
            if (peer.pending.has(frame.id) || peer.pending.size >= 64) return this.release(peer);
            const controller = new AbortController();
            peer.pending.set(frame.id, controller);
            const signal = AbortSignal.any([peer.abort.signal, controller.signal]);
            void this.request(peer, frame.method, frame.params, signal, controller.signal)
              .then(
                (result) => {
                  if (!signal.aborted) this.send(peer, { type: "response", id: frame.id, result });
                },
                (error: unknown) => {
                  if (!signal.aborted) {
                    const { code } = errorPayload(error);
                    this.send(peer, {
                      type: "response",
                      id: frame.id,
                      error: { code, message: code },
                    });
                  }
                },
              )
              .finally(() => peer.pending.delete(frame.id))
              .catch(() => this.release(peer));
          } catch {
            this.release(peer);
          }
        },
        close: (socket) => this.release(socket.data),
      },
    });
    this.maintenance = setInterval(() => {
      // Reading the clock every tick is what lets it tell suspension from silence.
      const now = this.clock.now();
      if (this.binding && this.binding.expires < now) this.retire(this.binding);
    }, maintenanceInterval);
    this.maintenance.unref();
  }
  async administrative(raw: unknown) {
    const operation = this.administrativeQueue.then(() => this.prepare(raw));
    this.administrativeQueue = operation.then(
      () => {},
      () => {},
    );
    return operation;
  }
  private async prepare(raw: unknown) {
    if (this.closed) throw new LocalError("CLOSING", "Desktop channel is stopping");
    const release = z
      .strictObject({ action: z.literal("release"), ownerId: bootstrapSchema.shape.ownerId })
      .safeParse(raw);
    if (release.success) {
      if (this.binding?.owner === release.data.ownerId) this.retire(this.binding);
      this.executions.release(release.data.ownerId);
      return { released: true };
    }
    const reset = z
      .strictObject({
        action: z.literal("reset_sessions"),
        key: bootstrapSchema.shape.key.unwrap(),
      })
      .safeParse(raw);
    if (reset.success) {
      sessionRecordStore(this.host.runtime.state.db, "https://reset.invalid").clear();
      if (this.binding) this.retire(this.binding);
      for (const api of this.sessions.values()) api.close();
      this.sessions.clear();
      return { reset: true };
    }
    const prepare = z
      .strictObject({ action: z.literal("prepare"), apiUrl: originSchema })
      .safeParse(raw);
    if (prepare.success) {
      const records = sessionRecordStore(this.host.runtime.state.db, prepare.data.apiUrl);
      const row = records.read();
      if (row && row.version !== 1)
        throw new LocalError("SESSION_VERSION_UNSUPPORTED", "Unsupported stored session version");
      return { createKey: !records.hasRows(), profileDirectory: this.directory };
    }
    const input = bootstrapSchema.parse(raw);
    // Nothing retires the working native/renderer binding until preparation succeeds.
    const runtime = (await this.host.request("runtime.info", {}, input.ownerId)) as {
      version: string;
      protocolVersion: number;
      features?: { localTerminalApprovals?: boolean };
    };
    if (this.closed) throw new LocalError("CLOSING", "Desktop channel is stopping");
    const store = encryptedSessionStore(
      sessionRecordStore(this.host.runtime.state.db, input.apiUrl),
      this.directory,
      input.apiUrl,
      input.key === undefined ? undefined : Buffer.from(input.key, "base64"),
    );
    let api = this.sessions.get(input.apiUrl);
    const candidate = api === undefined;
    if (!api) {
      api = new DesktopApi(new SessionCookies(input.apiUrl, store));
    } else if (input.key !== undefined) api.cookies.recover(store);
    try {
      api.cookies.assertAvailable();
      await this.host.control.selectDesktopOrigin(input.apiUrl);
      if (this.closed) throw new LocalError("CLOSING", "Desktop channel is stopping");
    } catch (error) {
      if (candidate) api.close();
      throw error;
    }
    const binding: Binding = {
      id: crypto.randomUUID(),
      capability: capability(),
      origin: input.apiUrl,
      owner: input.ownerId,
      api,
      pageOrigin: input.pageOrigin,
      abort: new AbortController(),
      lease: new AbortController(),
      visible: false,
      expires: this.clock.now() + leaseDuration,
      control: new DesktopControl(api, this.host, input.configDirs),
      notifications: { revision: 0, scope: "local" },
    };
    if (this.binding) this.retire(this.binding);
    this.binding = binding;
    this.sessions.set(input.apiUrl, api);
    this.pruneSessions();
    return {
      version: runtime.version,
      protocolVersion: runtime.protocolVersion,
      nativeCapability: binding.capability,
      channel: this.ticket(binding),
      recovery: api.cookies.recovery ?? null,
      features: { localTerminalApprovals: runtime.features?.localTerminalApprovals === true },
    };
  }
  async native(token: string, raw: unknown, signal: AbortSignal) {
    const binding = this.binding;
    if (
      !binding ||
      !matches(binding.capability, token) ||
      binding.abort.signal.aborted ||
      this.expired(binding)
    )
      throw new LocalError("FORBIDDEN", "Desktop native capability unavailable");
    const input = nativeInputSchema.parse(raw);
    binding.expires = this.clock.now() + leaseDuration;
    const operation = AbortSignal.any([signal, binding.abort.signal]);
    switch (input.action) {
      case "channel":
        return this.ticket(binding);
      case "visible":
        binding.visible = input.active;
        await this.updateLease(binding);
        return true;
      case "pick":
        return this.host.request("roots.register", { path: input.path }, binding.id, operation);
      case "notifications":
        return { ...binding.notifications, bindingId: binding.id };
      case "open_approvals":
        for (const peer of this.peers)
          if (peer.authenticated && peer.binding === binding)
            this.enqueue(peer, {
              version: 1,
              event: "approval.open",
              data: { scope: input.scope },
            });
        return true;
      case "release":
        this.retire(binding);
        return true;
      case "quit_tasks": {
        const ids = this.host.runtime.activeAgentTaskIds();
        delete binding.quitTasks;
        if (!ids.length) return { count: 0 };
        const confirmation = crypto.randomUUID();
        binding.quitTasks = { confirmation, ids };
        return { count: ids.length, confirmation };
      }
      case "stop_quit_tasks": {
        const selection = binding.quitTasks;
        if (!selection || selection.confirmation !== input.confirmation)
          throw new LocalError("QUIT_TASKS_CHANGED", "The task confirmation is no longer current");
        operation.throwIfAborted();
        delete binding.quitTasks;
        await this.host.runtime.stopAgentTasks(selection.ids);
        return { stopped: true };
      }
      case "quit":
        this.retire(binding);
        this.executions.release(binding.owner);
        return true;
    }
  }
  permitsNative(token: string) {
    const binding = this.binding;
    return (
      !!binding &&
      !binding.abort.signal.aborted &&
      !this.expired(binding) &&
      matches(binding.capability, token)
    );
  }
  private expired(binding: Binding) {
    return binding.expires < this.clock.now();
  }
  private ticket(binding: Binding): DesktopChannel {
    const ticket = { capability: capability(), expires: Date.now() + 30_000 };
    binding.ticket = ticket;
    return {
      protocol: 1,
      url: `ws://127.0.0.1:${this.server.port}/desktop`,
      capability: ticket.capability,
      expiresAt: new Date(ticket.expires).toISOString(),
    };
  }
  private async request(
    peer: Peer,
    method: string,
    raw: unknown,
    signal: AbortSignal,
    cancellation: AbortSignal,
  ) {
    const host = {
      request: async (...args: Parameters<ExecutionHost["request"]>) => {
        const [name, params] = args;
        if (name === "tools.run" || name.startsWith("terminal.") || name === "tools.cancel") {
          const scope = await this.executions.scope(peer.binding.owner, peer.binding.origin);
          signal.throwIfAborted();
          if (name === "tools.run" || name === "terminal.open")
            return this.executions.start(scope, name, params, signal, cancellation);
          const { id } = z.object({ id: z.string() }).parse(params);
          this.executions.control(scope, id);
        }
        return this.host.request(...args);
      },
    };
    const run = async () => {
      if (Object.hasOwn(desktopExecutionRequests, method)) {
        const input =
          desktopExecutionRequests[method as keyof typeof desktopExecutionRequests].parse(raw);
        const scope = await this.executions.scope(peer.binding.owner, peer.binding.origin);
        signal.throwIfAborted();
        if (method === "execution_list") return this.executions.list(scope);
        const { id } = z.object({ id: z.uuid() }).parse(input);
        if (method === "execution_result") return this.executions.result(scope, id);
        return this.executions.restore(scope, id);
      }
      return method === "local_request"
        ? peer.binding.control.localRequest(raw, peer.id, signal, host)
        : peer.binding.control.request(method, raw, peer.id, signal);
    };
    const api = peer.binding.api;
    this.apiOperations.set(api, (this.apiOperations.get(api) ?? 0) + 1);
    const operation = run();
    this.operations.add(operation);
    void operation
      .finally(() => {
        this.operations.delete(operation);
        const pending = this.apiOperations.get(api) ?? 1;
        if (pending <= 1) this.apiOperations.delete(api);
        else this.apiOperations.set(api, pending - 1);
        this.pruneSessions();
      })
      .catch(() => {});
    return abortable(signal, () => operation);
  }
  private pruneSessions() {
    for (const [origin, api] of this.sessions) {
      if (
        this.binding?.api !== api &&
        api.idle &&
        !this.apiOperations.get(api) &&
        !api.cookies.retainInMemory
      ) {
        this.sessions.delete(origin);
        this.apiOperations.delete(api);
      }
    }
  }
  emit(event: LocalEvent, encoded = JSON.stringify(event)) {
    const scope = this.executions.event(event, Buffer.byteLength(encoded));
    const processEvent = ["terminal.output", "terminal.exit", "tool.finished"].includes(
      event.event,
    );
    if (
      this.binding &&
      (event.event === "agent.changed" || event.event === "observed.changed") &&
      typeof event.data.pendingRequest === "string"
    ) {
      this.binding.notifications = {
        revision: this.binding.notifications.revision + 1,
        scope: event.event === "observed.changed" || event.data.local === true ? "local" : "remote",
      };
    }
    for (const peer of this.peers) {
      if (!peer.authenticated) continue;
      if (
        processEvent &&
        (!scope || scope.owner !== peer.binding.owner || scope.origin !== peer.binding.origin)
      )
        continue;
      this.enqueue(peer, event, encoded);
    }
  }
  private enqueue(peer: Peer, event: unknown, payload = JSON.stringify(event)) {
    const sequence = peer.sequence + 1;
    const encoded = `{"type":"event","streamId":"${peer.streamId}","sequence":${sequence},"event":${payload}}`;
    const size = Buffer.byteLength(encoded);
    if (
      size > frameLimit ||
      peer.bytes + size > frameLimit ||
      peer.events.length + peer.unacked.length >= eventLimit
    )
      return this.release(peer);
    peer.sequence = sequence;
    peer.events.push({ sequence, encoded, size });
    peer.bytes += size;
    this.pump(peer);
  }
  /** Sends queued events while the renderer has credit; acknowledgements reopen the window. */
  private pump(peer: Peer) {
    while (!peer.abort.signal.aborted && peer.events.length) {
      const event = peer.events[0]!;
      if (peer.inflight > 0 && peer.inflight + event.size > eventCredit) return;
      peer.events.shift();
      peer.unacked.push({ sequence: event.sequence, size: event.size });
      peer.inflight += event.size;
      peer.stall ??= setTimeout(() => this.release(peer), stallLimit);
      this.sendEncoded(peer, event.encoded, event.size);
    }
  }
  /** An acknowledgement covers every event up to its sequence; it must name a sent one. */
  private acknowledge(peer: Peer, streamId: string, sequence: number) {
    const oldest = peer.unacked[0],
      newest = peer.unacked.at(-1);
    if (
      streamId !== peer.streamId ||
      !oldest ||
      !newest ||
      sequence < oldest.sequence ||
      sequence > newest.sequence
    )
      return this.release(peer);
    while (peer.unacked.length && peer.unacked[0]!.sequence <= sequence) {
      const delivered = peer.unacked.shift()!;
      peer.inflight -= delivered.size;
      peer.bytes -= delivered.size;
    }
    clearTimeout(peer.stall);
    peer.stall = peer.unacked.length ? setTimeout(() => this.release(peer), stallLimit) : undefined;
    this.pump(peer);
  }
  private send(peer: Peer, packet: unknown) {
    const encoded = JSON.stringify(packet);
    this.sendEncoded(peer, encoded, Buffer.byteLength(encoded));
  }
  private sendEncoded(peer: Peer, encoded: string, size: number) {
    // Bun returns -1 for a queued frame; 0 means the frame was dropped.
    if (
      !peer.socket ||
      peer.abort.signal.aborted ||
      size > frameLimit ||
      peer.socket.getBufferedAmount() + size > frameLimit ||
      peer.socket.send(encoded) === 0
    )
      this.release(peer);
  }
  private async updateLease(binding: Binding) {
    binding.lease.abort();
    const lease = new AbortController();
    binding.lease = lease;
    const active =
      !binding.abort.signal.aborted &&
      binding.visible &&
      [...this.peers].some((peer) => peer.authenticated && peer.binding === binding);
    if (!active) this.host.terminal.releaseClient(binding.id);
    if (binding.abort.signal.aborted) return;
    try {
      await this.host.request(
        "approvals.local.watch",
        { active },
        binding.id,
        AbortSignal.any([binding.abort.signal, lease.signal, AbortSignal.timeout(2000)]),
      );
    } catch {
      // An unenrolled/offline profile still needs its renderer for enrollment.
      if (binding.lease === lease && !lease.signal.aborted)
        this.host.terminal.releaseClient(binding.id);
    }
  }
  private release(peer: Peer) {
    if (peer.abort.signal.aborted) return;
    peer.abort.abort();
    clearTimeout(peer.authentication);
    clearTimeout(peer.stall);
    peer.stall = undefined;
    peer.unacked.length = 0;
    peer.inflight = 0;
    this.peers.delete(peer);
    this.host.terminal.releaseClient(peer.id);
    peer.socket?.close(1008, "Desktop channel closed");
    peer.events.length = 0;
    peer.bytes = 0;
    if (peer.authenticated) void this.updateLease(peer.binding);
  }
  private retire(binding: Binding) {
    if (this.binding === binding) this.binding = undefined;
    binding.abort.abort();
    binding.lease.abort();
    binding.control.close();
    for (const peer of this.peers) if (peer.binding === binding) this.release(peer);
    this.host.terminal.releaseClient(binding.id);
    this.pruneSessions();
  }
  async close() {
    this.closed = true;
    clearInterval(this.maintenance);
    await this.administrativeQueue;
    if (this.binding) this.retire(this.binding);
    this.executions.release();
    await this.server.stop(true);
    await Promise.allSettled(this.operations);
  }
}
