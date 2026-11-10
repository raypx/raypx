import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hostname } from "node:os";
import {
  RelayConnection,
  relayUrl,
  systemRelayScheduler,
  type RelayScheduler,
  type RelaySocketFactory,
} from "@raypx/client/relay";
import {
  RELAY_VERSION,
  deviceGrantSchema,
  type DeviceGrant,
  type RelayClientFrame,
  type RelayServerFrame,
} from "@raypx/contracts/tasks";
import type { HostAgentPort } from "./agent-port";
import { AcknowledgedStream } from "../acknowledged-stream";
import { abortable } from "../cancellation";
import { failureCode } from "./failure";
import { serverOrigin } from "./origin";
import {
  acceptsCommands,
  initialRelaySession,
  relaySession,
  type RelaySessionEvent,
} from "./session";
import type { ControlInfo } from "@raypx/contracts/terminal";
import { readRemoteControlSettings, type Settings, type Binding } from "./settings";

type ObservedFrame = Extract<RelayClientFrame, { type: "observed" }>;
type FrameOf<Type extends RelayServerFrame["type"]> = Extract<RelayServerFrame, { type: Type }>;
export type RemoteControlOptions = {
  /** Holds this binding's `remote-control.json`. */
  directory: string;
  engine: HostAgentPort;
  /** A remote request is now pending locally. */
  notify: () => void;
  /** The grant cannot be renewed without the user. */
  grantRequired: () => void;
  socket?: RelaySocketFactory;
  scheduler?: RelayScheduler;
  renewGrant?: (accountId: string, binding: Binding, signal: AbortSignal) => Promise<DeviceGrant>;
  authorizationLost?: (code: "AUTH_REQUIRED" | "DEVICE_REVOKED") => Promise<void>;
  bindingKey?: (accountId: string, grant: DeviceGrant) => string;
  syncObserved?: (send: (frame: ObservedFrame) => void, signal: AbortSignal) => Promise<void>;
  observedAck?: (epoch: string, revision: number, signal: AbortSignal) => void;
  observedReset?: () => void;
  connected?: (connected: boolean) => void;
  /** Upper bound on waiting for in-flight commands before a renewed grant reconnects. */
  drainTimeoutMs?: number;
};

export class RemoteControl {
  private readonly directory: string;
  private readonly engine: HostAgentPort;
  private readonly notify: () => void;
  private readonly grantRequired: () => void;
  private readonly settings: Settings;
  private storageUnavailable = false;
  private accountId: string | null = null;
  private binding: string | undefined;
  private grant: DeviceGrant | undefined;
  private connection: RelayConnection | undefined;
  private timer: (() => void) | undefined;
  private session = initialRelaySession;
  private error: string | null = null;
  private renewAt = 0;
  private readonly stream: AcknowledgedStream;
  private bindingLifetime = new AbortController();
  private streamSignal: AbortSignal | undefined;
  private get cursor() {
    return this.stream.cursor?.sequence ?? 0;
  }
  private get streamId() {
    return this.stream.cursor?.streamId ?? "";
  }
  private snapshotNeeded = false;
  private readonly snapshotRequests = new Set<string>();
  private syncing: Promise<void> | undefined;
  private dirty = false;
  private readonly notified = new Set<string>();
  private apiUrl: string | undefined;
  private renewing: Promise<boolean> | undefined;
  private renewalFailures = 0;
  private renewalTimer: (() => void) | undefined;
  private readonly commands = new Set<Promise<void>>();
  /** Every lifecycle change goes through the pure `relaySession` transition. */
  private transition(event: RelaySessionEvent) {
    const previous = this.session;
    this.session = relaySession(previous, event);
    const available = this.session.phase === "available";
    if (available && event.type === "caught_up") this.options.connected?.(true);
    if (!available && previous.phase === "available") this.options.connected?.(false);
  }
  private get ready() {
    return this.session.phase !== "offline";
  }
  private get connected() {
    return this.session.phase === "available";
  }
  private get scheduler() {
    return this.options.scheduler ?? systemRelayScheduler;
  }
  private scheduleRenewal(disconnect = true) {
    if (this.renewalTimer || !this.accountId || this.error === "UPGRADE_REQUIRED") return;
    const signal = this.bindingLifetime.signal;
    if (signal.aborted) return;
    if (disconnect) this.resetConnection();
    const delay = Math.max(
      this.renewAt - this.scheduler.now(),
      Math.min(30_000, 500 * 2 ** Math.min(this.renewalFailures++, 6)) *
        (0.8 + this.scheduler.random() * 0.2),
    );
    this.renewAt = this.scheduler.now() + delay;
    const timer = this.scheduler.timeout(() => {
      if (signal.aborted || this.renewalTimer !== timer) return;
      this.renewalTimer = undefined;
      void this.refreshGrant()
        .then((restored) => {
          if (signal.aborted) return;
          if (!restored && this.accountId && !this.connected) this.scheduleRenewal(false);
        })
        .catch(() => {
          if (!signal.aborted) this.error = "NETWORK_UNAVAILABLE";
        });
    }, delay);
    this.renewalTimer = timer;
  }
  constructor(private readonly options: RemoteControlOptions) {
    this.stream = new AcknowledgedStream(this.scheduler);
    const directory = options.directory;
    this.directory = directory;
    this.engine = options.engine;
    this.notify = options.notify;
    this.grantRequired = options.grantRequired;
    this.settings = { installationId: crypto.randomUUID(), accounts: {} };
    try {
      mkdirSync(directory, { recursive: true });
      const saved = readRemoteControlSettings(directory);
      if (saved) this.settings = saved;
      else this.save();
    } catch {
      this.storageUnavailable = true;
    }
  }
  private save() {
    if (this.storageUnavailable) throw new Error("Remote settings are unavailable");
    const path = join(this.directory, "remote-control.json");
    writeFileSync(path + ".tmp", JSON.stringify(this.settings), { mode: 0o600 });
    renameSync(path + ".tmp", path);
  }
  private reportedError(accountId: string) {
    if (this.storageUnavailable) return "SETTINGS_UNAVAILABLE";
    return this.accountId === accountId ? this.error : null;
  }
  info(accountId: string): ControlInfo {
    const saved = this.settings.accounts[accountId];
    return {
      installationId: this.settings.installationId,
      name: hostname(),
      enabled: saved?.enabled ?? false,
      connected: this.accountId === accountId && this.connected,
      pendingRevoke: saved?.pendingRevoke ?? null,
      binding: saved?.binding ?? null,
      terminalSupported: true,
      error: this.reportedError(accountId),
    };
  }
  async enable(accountId: string, enabled: boolean) {
    if (this.storageUnavailable) throw new Error("Remote settings are unavailable");
    const saved = this.settings.accounts[accountId] ?? { enabled: false };
    saved.enabled = enabled;
    if (!enabled && saved.binding) saved.pendingRevoke = saved.binding;
    this.settings.accounts[accountId] = saved;
    this.save();
    if (!enabled && this.accountId === accountId) await this.detach();
    if (enabled && !this.accountId) {
      this.accountId = accountId;
      this.maintenance();
    }
    return this.info(accountId);
  }
  revoked(accountId: string) {
    const saved = this.settings.accounts[accountId];
    if (saved) {
      delete saved.pendingRevoke;
      delete saved.binding;
      this.save();
    }
    return this.info(accountId);
  }
  async attach(accountId: string, apiUrl: string, raw: DeviceGrant, parent?: AbortSignal) {
    parent?.throwIfAborted();
    const grant = deviceGrantSchema.parse(raw);
    apiUrl = serverOrigin(apiUrl);
    if (
      !this.settings.accounts[accountId]?.enabled ||
      this.settings.accounts[accountId]?.pendingRevoke
    )
      throw new Error("Remote control is disabled");
    const binding =
      this.options.bindingKey?.(accountId, grant) ??
      `${accountId}:${grant.deviceId}:${grant.epoch}`;
    if (this.binding !== binding) {
      await this.detach();
      this.transition({ type: "retired" });
    }
    parent?.throwIfAborted();
    this.bindingLifetime.abort();
    const lifetime = new AbortController();
    this.bindingLifetime = lifetime;
    if (parent)
      parent.addEventListener(
        "abort",
        () => {
          if (lifetime.signal.aborted) return;
          lifetime.abort();
          this.renewalTimer?.();
          this.renewalTimer = undefined;
          this.timer?.();
          this.timer = undefined;
          this.resetConnection();
        },
        { once: true, signal: lifetime.signal },
      );
    this.renewing = undefined;
    this.transition({ type: "draining", active: false });
    this.transition({ type: "detaching", active: false });
    this.accountId = accountId;
    this.binding = binding;
    this.grant = grant;
    this.apiUrl = apiUrl;
    this.error = null;
    this.renewAt = 0;
    const saved = this.settings.accounts[accountId];
    if (!saved) throw new Error("Remote control is disabled");
    saved.binding = { deviceId: grant.deviceId, epoch: grant.epoch };
    this.save();
    this.connect(apiUrl);
    this.maintenance();
    return this.info(accountId);
  }
  /** Drops everything that was only valid while the relay socket was up. */
  private disconnected(event: RelaySessionEvent) {
    this.transition(event);
    this.snapshotRequests.clear();
    this.stream.reset();
    this.streamSignal = undefined;
    this.syncing = undefined;
    this.options.observedReset?.();
  }
  private resetConnection() {
    // Retire first so nothing the old connection reports while stopping is taken as current.
    this.disconnected({ type: "retired" });
    this.connection?.stop();
    this.connection = undefined;
  }
  private connect(apiUrl: string) {
    this.resetConnection();
    const grant = this.grant,
      bindingSignal = this.bindingLifetime.signal;
    if (!grant || !this.accountId) return;
    this.connection = new RelayConnection({
      scheduler: this.scheduler,
      url: relayUrl(apiUrl, this.accountId),
      ...(this.options.socket ? { socket: this.options.socket } : {}),
      authenticate: async () => ({
        type: "auth",
        protocolVersion: RELAY_VERSION,
        role: "device",
        token: grant.token,
      }),
      status: (connected, code, signal) => {
        if (connected && signal) {
          this.streamSignal = signal;
          signal.addEventListener(
            "abort",
            () => {
              if (this.streamSignal === signal) this.disconnected({ type: "dropped" });
            },
            { once: true },
          );
        }
        if (!connected) {
          this.error = code ?? "NETWORK_UNAVAILABLE";
          this.disconnected({ type: "dropped" });
          if (code === "DEVICE_REVOKED" && this.accountId)
            void this.loseAuthorization(this.accountId, code).catch(() => {
              if (!bindingSignal.aborted) this.error = code;
            });
          if (code === "AUTH_REQUIRED") this.scheduleRenewal();
        }
      },
      message: (frame, signal) => {
        const pending = this.message(frame, signal).catch(() => {
          if (!signal.aborted) {
            this.error = "NETWORK_UNAVAILABLE";
            this.connection?.restart();
          }
        });
        if (frame.type === "command") {
          this.commands.add(pending);
          void pending.finally(() => this.commands.delete(pending));
        }
      },
    });
    this.connection.start();
  }
  private maintenance() {
    if (this.timer) this.timer();
    const signal = this.bindingLifetime.signal;
    const check = () => {
      if (signal.aborted || !this.accountId || this.error === "UPGRADE_REQUIRED") return;
      if (
        (!this.grant || Date.parse(this.grant.expiresAt) - this.scheduler.now() < 60_000) &&
        this.scheduler.now() >= this.renewAt &&
        !this.renewalTimer &&
        !this.renewing
      ) {
        if (!this.grant) this.renewAt = this.scheduler.now() + 15_000;
        void this.refreshGrant().catch(() => {
          if (!signal.aborted) this.error = "NETWORK_UNAVAILABLE";
        });
      }
    };
    check();
    this.timer = this.scheduler.interval(check, 15_000);
  }
  /** Native renewal remains active when the renderer is hidden or suspended. */
  refreshGrant(): Promise<boolean> {
    if (this.renewing) return this.renewing;
    const accountId = this.accountId,
      grant = this.grant,
      apiUrl = this.apiUrl;
    if (!accountId || !grant || !apiUrl || !this.options.renewGrant) {
      this.grantRequired();
      return Promise.resolve(false);
    }
    const signal = this.bindingLifetime.signal;
    const pending = (async () => {
      try {
        const next = deviceGrantSchema.parse(
          await abortable(signal, () =>
            this.options.renewGrant!(
              accountId,
              {
                deviceId: grant.deviceId,
                epoch: grant.epoch,
              },
              signal,
            ),
          ),
        );
        if (
          signal.aborted ||
          this.accountId !== accountId ||
          !this.settings.accounts[accountId]?.enabled
        )
          return false;
        if (
          next.deviceId !== grant.deviceId ||
          next.epoch !== grant.epoch ||
          !Number.isFinite(Date.parse(next.expiresAt)) ||
          Date.parse(next.expiresAt) <= this.scheduler.now()
        )
          throw new Error("Invalid renewed grant");
        this.grant = next;
        this.error = null;
        this.transition({ type: "draining", active: true });
        let timeout: (() => void) | undefined;
        try {
          await abortable(signal, () =>
            Promise.race([
              Promise.allSettled(this.commands),
              new Promise<void>((resolve) => {
                timeout = this.scheduler.timeout(resolve, this.options.drainTimeoutMs ?? 10_000);
              }),
            ]),
          );
        } finally {
          timeout?.();
          if (!signal.aborted) this.transition({ type: "draining", active: false });
        }
        if (signal.aborted || this.accountId !== accountId) return false;
        // Reconnect the relay without detaching the host binding or its tasks.
        this.connect(apiUrl);
        return true;
      } catch (error) {
        if (signal.aborted || this.accountId !== accountId) return false;
        const code = failureCode(error);
        if (code === "DEVICE_REVOKED") await this.loseAuthorization(accountId, code);
        else if (code === "AUTH_REQUIRED" || code === "UNAUTHORIZED")
          await this.loseAuthorization(accountId, "AUTH_REQUIRED");
        else {
          this.error = "NETWORK_UNAVAILABLE";
          this.scheduleRenewal(false);
        }
        return false;
      }
    })();
    this.renewing = pending;
    const completed = () => {
      if (this.renewing === pending) this.renewing = undefined;
    };
    void pending.then(completed, completed);
    return pending;
  }
  private async loseAuthorization(accountId: string, code: "AUTH_REQUIRED" | "DEVICE_REVOKED") {
    if (this.options.authorizationLost) {
      await this.options.authorizationLost(code);
      return;
    }
    if (code === "DEVICE_REVOKED") await this.enable(accountId, false);
    else await this.detach();
  }
  private async message(frame: RelayServerFrame, signal: AbortSignal) {
    if (signal.aborted) return;
    const binding = this.binding;
    if (!binding) return;
    switch (frame.type) {
      case "observed_ack":
        this.options.observedAck?.(frame.epoch, frame.revision, signal);
        return;
      case "ready":
        return this.announce(binding, signal);
      case "resume":
        return this.resume(frame);
      case "ack":
        this.acknowledge(frame);
        return;
      case "command":
        return this.command(frame, binding, signal);
      case "error":
        this.error = frame.code;
        if (frame.code === "AUTH_REQUIRED") this.scheduleRenewal();
        if (frame.code === "ACTIVITY_BASE_MISMATCH") this.snapshotNeeded = true;
        return;
      // Frames addressed to other relay roles carry nothing for a device.
      case "changed":
      case "observed_changed":
      case "pong":
      case "result":
        return;
    }
  }
  private async announce(binding: string, signal: AbortSignal) {
    const [replay, projects, capabilities] = await Promise.all([
      abortable(signal, () => this.engine.replay({ binding, after: 0 }, signal)),
      abortable(signal, () => this.engine.projects({}, signal)),
      abortable(signal, () => this.engine.capabilities({}, signal)),
    ]);
    if (signal.aborted) return;
    const info = await abortable(signal, () => this.engine.events({ binding }, signal));
    if (signal.aborted) return;
    this.connection?.send({
      type: "announce",
      streamId: replay.streamId,
      instanceId: info.instanceId,
      projects,
      capabilities,
    });
  }
  private async resume(frame: FrameOf<"resume">) {
    if (frame.syncId) {
      if (!this.ready || frame.streamId !== this.streamId || !frame.snapshot) return;
      if (!this.snapshotRequests.has(frame.syncId) && this.snapshotRequests.size >= 64)
        throw new Error("Snapshot request limit");
      this.snapshotRequests.add(frame.syncId);
    } else {
      this.options.observedReset?.();
      this.stream.reset({ streamId: frame.streamId, sequence: frame.sequence });
      this.snapshotNeeded ||= frame.snapshot;
      this.transition({ type: "resumed" });
    }
    await this.wake();
  }
  private acknowledge(frame: FrameOf<"ack">) {
    this.stream.acknowledge({
      streamId: frame.streamId,
      sequence: frame.sequence,
      ...(frame.snapshotId ? { snapshotId: frame.snapshotId } : {}),
    });
  }
  private execute(binding: string, command: FrameOf<"command">["command"], signal: AbortSignal) {
    if (command.request.method !== "observed.decide")
      return this.engine.remote({ binding, command }, signal);
    return this.engine.observed({ binding, decision: command.request.input }, signal).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({
        ok: false as const,
        code:
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : "REQUEST_CLOSED",
      }),
    );
  }
  private async command(frame: FrameOf<"command">, binding: string, signal: AbortSignal) {
    if (!acceptsCommands(this.session)) {
      this.connection?.send({
        type: "result",
        routeId: frame.routeId,
        result: { ok: false, code: "REQUEST_CLOSED" },
      });
      return;
    }
    // Admission is durable: abort only the obsolete response, never accepted execution.
    const result = await abortable(signal, () => this.execute(binding, frame.command, signal));
    if (signal.aborted) return;
    await this.wake();
    while (this.syncing && !signal.aborted) await this.syncing;
    if (!signal.aborted) this.connection?.send({ type: "result", routeId: frame.routeId, result });
  }
  wake(): Promise<void> {
    this.dirty = true;
    if (this.syncing) return this.syncing;
    if (!this.ready || !this.binding) return Promise.resolve();
    const signal = this.streamSignal;
    if (!signal || signal.aborted) return Promise.resolve();
    const operation = this.flush(signal)
      .catch(() => {
        if (!signal.aborted) {
          this.error = "NETWORK_UNAVAILABLE";
          this.connection?.restart();
        }
      })
      .finally(() => {
        if (this.syncing === operation) this.syncing = undefined;
        if (!signal.aborted && this.dirty && this.ready)
          void this.wake().catch(() => {
            if (!signal.aborted) this.error = "NETWORK_UNAVAILABLE";
          });
      });
    this.syncing = operation;
    return operation;
  }
  private async flush(signal: AbortSignal) {
    const binding = this.binding!;
    while (this.ready && !signal.aborted) {
      this.dirty = false;
      const syncId = this.snapshotRequests.values().next().value;
      if (this.snapshotNeeded || syncId) {
        let id: string | undefined,
          offset = 0,
          ack: Promise<void> | undefined;
        for (;;) {
          const page = await abortable(signal, () =>
            this.engine.snapshot(
              {
                binding,
                ...(id ? { id } : {}),
                offset,
              },
              signal,
            ),
          );
          if (signal.aborted) return;
          if (!id) {
            id = page.id;
            ack = this.stream.wait(
              { streamId: page.streamId, sequence: page.sequence, snapshotId: id },
              signal,
            );
            void ack.catch(() => {});
          }
          this.connection?.send({
            type: "snapshot",
            id: page.id,
            ...(syncId ? { syncId } : {}),
            streamId: page.streamId,
            sequence: page.sequence,
            records: page.records,
            done: page.done,
          });
          offset = page.next;
          if (page.done) {
            await ack;
            signal.throwIfAborted();
            this.snapshotNeeded = false;
            if (syncId) this.snapshotRequests.delete(syncId);
            break;
          }
        }
      }
      const replay = await abortable(signal, () =>
        this.engine.replay(
          {
            binding,
            after: this.cursor,
          },
          signal,
        ),
      );
      if (signal.aborted) return;
      if (
        replay.streamId !== this.streamId ||
        this.cursor > replay.sequence ||
        replay.floor > this.cursor + 1
      ) {
        this.snapshotNeeded = true;
        continue;
      }
      if (!replay.events.length) {
        await abortable(signal, () =>
          this.engine.checkpoint({ binding, sequence: this.cursor }, signal),
        );
        if (signal.aborted) return;
        this.connection?.send({ type: "available" });
        this.transition({ type: "caught_up" });
        // The socket reconnected mid-flush; its own resume starts the next flush.
        if (!this.connected) return;
        this.renewalFailures = 0;
        this.renewAt = 0;
        this.error = null;
        await abortable(signal, () =>
          this.options.syncObserved?.((frame) => {
            signal.throwIfAborted();
            this.connection!.send(frame);
          }, signal),
        );
        if (!this.dirty && !this.snapshotRequests.size) return;
        continue;
      }
      const last = replay.events.at(-1)!;
      const ack = this.stream.wait({ streamId: this.streamId, sequence: last.sequence }, signal);
      void ack.catch(() => {});
      this.connection?.send({ type: "events", streamId: this.streamId, events: replay.events });
      await ack;
      signal.throwIfAborted();
      await abortable(signal, () =>
        this.engine.checkpoint({ binding, sequence: this.cursor }, signal),
      );
      signal.throwIfAborted();
      for (const { event } of replay.events)
        if (
          event.kind === "request" &&
          event.request.status === "pending" &&
          !this.notified.has(event.id)
        ) {
          this.notified.add(event.id);
          if (this.notified.size > 4096) this.notified.delete(this.notified.values().next().value!);
          this.notify();
        }
    }
  }
  async detach() {
    const lifetime = this.bindingLifetime;
    lifetime.abort();
    this.renewing = undefined;
    this.transition({ type: "draining", active: false });
    this.renewalTimer?.();
    this.renewalTimer = undefined;
    if (this.timer) this.timer();
    this.timer = undefined;
    const binding = this.binding;
    this.transition({ type: "detaching", active: true });
    if (binding) {
      await this.engine.detach({ binding }).catch(() => {});
      if (this.bindingLifetime !== lifetime) return;
      if (this.ready) {
        let cancel: (() => void) | undefined;
        try {
          await Promise.race([
            this.wake(),
            new Promise<void>((resolve) => {
              cancel = this.scheduler.timeout(resolve, 2000);
            }),
          ]);
        } finally {
          cancel?.();
        }
      }
    }
    if (this.bindingLifetime !== lifetime) return;
    this.resetConnection();
    this.binding = undefined;
    this.grant = undefined;
    this.apiUrl = undefined;
    this.accountId = null;
    this.error = null;
    this.transition({ type: "detaching", active: false });
    this.dirty = false;
  }
}
