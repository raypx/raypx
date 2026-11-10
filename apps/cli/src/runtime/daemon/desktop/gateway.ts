import type { ServerWebSocket } from "bun";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { desktopClientFrameSchema, type DesktopChannel } from "@raypx/contracts/desktop";
import { localParams, type LocalEvent } from "@raypx/contracts/local";
import { errorPayload, LocalError } from "../../errors.ts";
import type { ExecutionHost } from "../../owner.ts";
import { AcknowledgedStream } from "../acknowledged-stream.ts";
import { abortable } from "../cancellation.ts";
import { serverOrigin } from "../remote/origin.ts";
import { DesktopApi } from "./api.ts";
import { SessionCookies } from "./cookies.ts";
import { DesktopControl } from "./control.ts";
import { encryptedSessionStore, sessionRecordStore } from "./sessions.ts";

const capability = () => crypto.randomUUID() + crypto.randomUUID();
const frameLimit = 8 * 1024 * 1024;
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
]);
type Binding = {
  id: string;
  capability: string;
  origin: string;
  pageOrigin: string;
  control: DesktopControl;
  abort: AbortController;
  visible: boolean;
  lease: AbortController;
  ticket?: { capability: string; expires: number };
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
  children: Set<string>;
  pending: Map<string, AbortController>;
  events: { sequence: number; event: unknown; size: number }[];
  bytes: number;
  sequence: number;
  streamId: string;
  stream: AcknowledgedStream;
  sending: boolean;
};

/** A distinct loopback listener: administrative IPC is never upgraded or exposed to a page. */
export class DesktopGateway {
  private binding: Binding | undefined;
  private readonly peers = new Set<Peer>();
  private readonly sessions = new Map<string, DesktopApi>();
  private readonly operations = new Set<Promise<unknown>>();
  private readonly server: ReturnType<typeof Bun.serve<Peer>>;
  private readonly maintenance: ReturnType<typeof setInterval>;
  private closed = false;
  constructor(
    private readonly host: ExecutionHost,
    private readonly directory: string,
  ) {
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
          binding.expires < Date.now() ||
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
          children: new Set(),
          pending: new Map(),
          events: [],
          bytes: 0,
          sequence: 0,
          streamId: crypto.randomUUID(),
          stream: new AcknowledgedStream(),
          sending: false,
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
              peer.binding.expires < Date.now() ||
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
              if (!peer.stream.acknowledge({ streamId: frame.streamId, sequence: frame.sequence }))
                this.release(peer);
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
            void this.request(peer, frame.method, frame.params, signal)
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
      if (this.binding && this.binding.expires < Date.now()) this.retire(this.binding);
    }, 5000);
    this.maintenance.unref();
  }
  async administrative(raw: unknown) {
    if (this.closed) throw new LocalError("CLOSING", "Desktop channel is stopping");
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
    let api = this.sessions.get(input.apiUrl);
    if (!api) {
      if (this.sessions.size >= 8)
        throw new LocalError("DESKTOP_BUSY", "Restart daemon before selecting more servers");
      const store = encryptedSessionStore(
        sessionRecordStore(this.host.runtime.state.db, input.apiUrl),
        this.directory,
        input.apiUrl,
        input.key === undefined ? undefined : Buffer.from(input.key, "base64"),
      );
      api = new DesktopApi(new SessionCookies(input.apiUrl, store));
      this.sessions.set(input.apiUrl, api);
    }
    api.cookies.assertAvailable();
    await this.host.control.selectDesktopOrigin(input.apiUrl);
    if (this.binding) {
      const previous = this.binding;
      this.retire(previous);
    }
    const binding: Binding = {
      id: crypto.randomUUID(),
      capability: capability(),
      origin: input.apiUrl,
      pageOrigin: input.pageOrigin,
      abort: new AbortController(),
      lease: new AbortController(),
      visible: false,
      expires: Date.now() + 20_000,
      control: new DesktopControl(api, this.host, input.configDirs),
      notifications: { revision: 0, scope: "local" },
    };
    this.binding = binding;
    const runtime = (await this.host.request(
      "runtime.info",
      {},
      binding.id,
      binding.abort.signal,
    )) as {
      version: string;
      protocolVersion: number;
      features?: { localTerminalApprovals?: boolean };
    };
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
      binding.expires < Date.now()
    )
      throw new LocalError("FORBIDDEN", "Desktop native capability unavailable");
    const input = nativeInputSchema.parse(raw);
    binding.expires = Date.now() + 20_000;
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
    }
  }
  permitsNative(token: string) {
    const binding = this.binding;
    return (
      !!binding &&
      !binding.abort.signal.aborted &&
      binding.expires >= Date.now() &&
      matches(binding.capability, token)
    );
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
  private async request(peer: Peer, method: string, raw: unknown, signal: AbortSignal) {
    let tool: string | undefined;
    const host = {
      request: async (...args: Parameters<ExecutionHost["request"]>) => {
        const [name, params] = args;
        if (name === "tools.run") {
          const input = localParams["tools.run"].parse(params);
          tool = input.id ?? crypto.randomUUID();
          peer.children.add(tool);
          args[1] = { ...input, id: tool };
        }
        const result = await this.host.request(...args);
        if (
          name === "terminal.open" &&
          result &&
          typeof result === "object" &&
          "id" in result &&
          typeof result.id === "string"
        ) {
          if (peer.abort.signal.aborted || args[3]?.aborted)
            this.host.runtime.processes.cancel(result.id);
          else peer.children.add(result.id);
        }
        return result;
      },
    };
    // Track child execution at the transport boundary while reusing the binding's account policy.
    const operation =
      method === "local_request"
        ? peer.binding.control.localRequest(raw, peer.id, signal, host)
        : peer.binding.control.request(method, raw, peer.id, signal);
    this.operations.add(operation);
    void operation.finally(() => this.operations.delete(operation)).catch(() => {});
    try {
      return await abortable(signal, () => operation);
    } finally {
      if (tool) peer.children.delete(tool);
    }
  }
  emit(event: LocalEvent) {
    if (
      (event.event === "terminal.exit" || event.event === "tool.finished") &&
      typeof event.data.id === "string"
    )
      for (const peer of this.peers) peer.children.delete(event.data.id);
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
    for (const peer of this.peers) if (peer.authenticated) this.enqueue(peer, event);
  }
  private enqueue(peer: Peer, event: unknown) {
    const size = Buffer.byteLength(JSON.stringify(event));
    if (size > 8 * 1024 * 1024 || peer.bytes + size > 8 * 1024 * 1024 || peer.events.length >= 1024)
      return this.release(peer);
    peer.events.push({ sequence: ++peer.sequence, event, size });
    peer.bytes += size;
    void this.flush(peer).catch(() => this.release(peer));
  }
  private async flush(peer: Peer) {
    if (peer.sending) return;
    peer.sending = true;
    try {
      while (!peer.abort.signal.aborted && peer.events.length) {
        const event = peer.events[0]!;
        await peer.stream.wait(
          { streamId: peer.streamId, sequence: event.sequence },
          peer.abort.signal,
          () =>
            this.send(peer, {
              type: "event",
              streamId: peer.streamId,
              sequence: event.sequence,
              event: event.event,
            }),
        );
        peer.events.shift();
        peer.bytes -= event.size;
      }
    } finally {
      peer.sending = false;
    }
  }
  private send(peer: Peer, packet: unknown) {
    const encoded = JSON.stringify(packet);
    // Bun returns -1 for a queued frame; 0 means the frame was dropped.
    if (
      !peer.socket ||
      peer.abort.signal.aborted ||
      Buffer.byteLength(encoded) > frameLimit ||
      peer.socket.getBufferedAmount() + Buffer.byteLength(encoded) > frameLimit ||
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
    peer.stream.reset();
    this.peers.delete(peer);
    for (const child of peer.children) this.host.runtime.processes.cancel(child);
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
  }
  async close() {
    this.closed = true;
    clearInterval(this.maintenance);
    if (this.binding) this.retire(this.binding);
    await this.server.stop(true);
    await Promise.allSettled(this.operations);
  }
}
