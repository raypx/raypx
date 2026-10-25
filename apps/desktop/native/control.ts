import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hostname } from "node:os";
import { RelayConnection, relayUrl, type RelaySocketFactory } from "@raypx/client";
import {
  deviceGrantSchema,
  type DeviceGrant,
  type DeviceProject,
  type AgentCapability,
  type RelayServerFrame,
  type SequencedEvent,
  type SnapshotRecord,
} from "@raypx/contracts/tasks";
import type { LocalEngine } from "./engine";
import { parseServerOrigin } from "../config";

interface Binding {
  deviceId: string;
  epoch: number;
}
interface Settings {
  installationId: string;
  accounts: Record<string, { enabled: boolean; binding?: Binding; pendingRevoke?: Binding }>;
}
export interface ControlInfo {
  installationId: string;
  name: string;
  enabled: boolean;
  connected: boolean;
  pendingRevoke: Binding | null;
  binding: Binding | null;
  error: string | null;
}
export class RemoteControl {
  private readonly settings: Settings;
  private storageUnavailable = false;
  private accountId: string | null = null;
  private binding: string | undefined;
  private grant: DeviceGrant | undefined;
  private connection: RelayConnection | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private generation = 0;
  private error: string | null = null;
  private renewAt = 0;
  private connected = false;
  private ready = false;
  private cursor = 0;
  private streamId = "";
  private snapshotNeeded = false;
  private syncing: Promise<void> | undefined;
  private dirty = false;
  private detaching = false;
  private acknowledgement:
    | {
        sequence: number;
        snapshotId?: string;
        resolve(): void;
        reject(): void;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;
  private readonly notified = new Set<string>();
  private apiUrl: string | undefined;
  private renewing: Promise<boolean> | undefined;
  private renewalFailures = 0;
  private renewalTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly commands = new Set<Promise<void>>();
  private scheduleRenewal(disconnect = true) {
    if (this.renewalTimer || !this.accountId || this.error === "UPGRADE_REQUIRED") return;
    if (disconnect) this.resetConnection();
    const delay = Math.max(
      this.renewAt - Date.now(),
      Math.min(30_000, 500 * 2 ** Math.min(this.renewalFailures++, 6)) *
        (0.8 + Math.random() * 0.2),
    );
    this.renewAt = Date.now() + delay;
    this.renewalTimer = setTimeout(() => {
      this.renewalTimer = undefined;
      void this.refreshGrant().then((restored) => {
        if (!restored && this.accountId && !this.connected) this.scheduleRenewal(false);
      });
    }, delay);
  }
  constructor(
    private readonly directory: string,
    private readonly engine: Pick<LocalEngine, "request">,
    private readonly notify: () => void,
    private readonly grantRequired: () => void,
    private readonly options: {
      socket?: RelaySocketFactory;
      renewGrant?: (accountId: string, binding: Binding) => Promise<DeviceGrant>;
    } = {},
  ) {
    this.settings = { installationId: crypto.randomUUID(), accounts: {} };
    try {
      mkdirSync(directory, { recursive: true });
      const path = join(directory, "remote-control.json");
      if (existsSync(path)) {
        const raw = readFileSync(path, "utf8");
        if (raw.length > 64 * 1024) throw new Error("Settings exceed limit");
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new Error("Invalid settings");
        const data = value as Record<string, unknown>;
        if (
          typeof data.installationId !== "string" ||
          !/^[a-f0-9-]{36}$/.test(data.installationId) ||
          !data.accounts ||
          typeof data.accounts !== "object" ||
          Array.isArray(data.accounts)
        )
          throw new Error("Invalid settings");
        const accounts: Settings["accounts"] = {};
        for (const [id, rawAccount] of Object.entries(data.accounts)) {
          if (!rawAccount || typeof rawAccount !== "object" || Array.isArray(rawAccount))
            throw new Error("Invalid account settings");
          const item = rawAccount as Record<string, unknown>;
          if (typeof item.enabled !== "boolean") throw new Error("Invalid account settings");
          const binding = (rawBinding: unknown): Binding => {
            if (!rawBinding || typeof rawBinding !== "object") throw new Error("Invalid binding");
            const candidate = rawBinding as Record<string, unknown>;
            if (
              typeof candidate.deviceId !== "string" ||
              !Number.isSafeInteger(candidate.epoch) ||
              Number(candidate.epoch) < 1
            )
              throw new Error("Invalid binding");
            return { deviceId: candidate.deviceId, epoch: Number(candidate.epoch) };
          };
          accounts[id] = {
            enabled: item.enabled,
            ...(item.binding ? { binding: binding(item.binding) } : {}),
            ...(item.pendingRevoke ? { pendingRevoke: binding(item.pendingRevoke) } : {}),
          };
        }
        this.settings = { installationId: data.installationId, accounts };
      } else this.save();
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
  info(accountId: string): ControlInfo {
    const saved = this.settings.accounts[accountId];
    return {
      installationId: this.settings.installationId,
      name: hostname(),
      enabled: saved?.enabled ?? false,
      connected: this.accountId === accountId && this.connected,
      pendingRevoke: saved?.pendingRevoke ?? null,
      binding: saved?.binding ?? null,
      error: this.storageUnavailable
        ? "SETTINGS_UNAVAILABLE"
        : this.accountId === accountId
          ? this.error
          : null,
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
  async attach(accountId: string, apiUrl: string, raw: DeviceGrant) {
    const grant = deviceGrantSchema.parse(raw);
    apiUrl = parseServerOrigin(apiUrl);
    if (
      !this.settings.accounts[accountId]?.enabled ||
      this.settings.accounts[accountId]?.pendingRevoke
    )
      throw new Error("Remote control is disabled");
    const binding = `${accountId}:${grant.deviceId}:${grant.epoch}`;
    if (this.binding !== binding) {
      await this.detach();
      this.generation++;
    }
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
  private resetConnection() {
    this.generation++;
    this.connection?.stop();
    this.connection = undefined;
    this.connected = false;
    this.ready = false;
    this.acknowledgement?.reject();
  }
  private connect(apiUrl: string) {
    this.resetConnection();
    const generation = this.generation,
      grant = this.grant;
    if (!grant || !this.accountId) return;
    this.connection = new RelayConnection({
      url: relayUrl(apiUrl, this.accountId),
      ...(this.options.socket ? { socket: this.options.socket } : {}),
      authenticate: async () => ({
        type: "auth",
        protocolVersion: 2,
        role: "device",
        token: grant.token,
      }),
      status: (connected, code) => {
        if (generation !== this.generation) return;
        if (!connected) {
          this.ready = false;
          this.connected = false;
          this.error = code ?? "NETWORK_UNAVAILABLE";
          this.acknowledgement?.reject();
          if (code === "DEVICE_REVOKED" && this.accountId) void this.enable(this.accountId, false);
          if (code === "AUTH_REQUIRED") this.scheduleRenewal();
        }
      },
      message: (frame) => {
        if (generation === this.generation) {
          const pending = this.message(frame, generation).catch(() => {
            if (generation === this.generation) {
              this.error = "NETWORK_UNAVAILABLE";
              this.connection?.restart();
            }
          });
          if (frame.type === "command") {
            this.commands.add(pending);
            void pending.finally(() => this.commands.delete(pending));
          }
        }
      },
    });
    this.connection.start();
  }
  private maintenance() {
    if (this.timer) clearInterval(this.timer);
    const check = () => {
      if (!this.accountId || this.error === "UPGRADE_REQUIRED") return;
      if (
        (!this.grant || Date.parse(this.grant.expiresAt) - Date.now() < 60_000) &&
        Date.now() >= this.renewAt &&
        !this.renewalTimer &&
        !this.renewing
      ) {
        if (!this.grant) this.renewAt = Date.now() + 15_000;
        void this.refreshGrant();
      }
    };
    check();
    this.timer = setInterval(check, 15_000);
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
    const generation = this.generation;
    const pending = (async () => {
      try {
        const next = deviceGrantSchema.parse(
          await this.options.renewGrant!(accountId, {
            deviceId: grant.deviceId,
            epoch: grant.epoch,
          }),
        );
        if (
          generation !== this.generation ||
          this.accountId !== accountId ||
          !this.settings.accounts[accountId]?.enabled
        )
          return false;
        if (
          next.deviceId !== grant.deviceId ||
          next.epoch !== grant.epoch ||
          !Number.isFinite(Date.parse(next.expiresAt)) ||
          Date.parse(next.expiresAt) <= Date.now()
        )
          throw new Error("Invalid renewed grant");
        this.grant = next;
        this.error = null;
        while (this.commands.size) await Promise.allSettled(this.commands);
        if (generation !== this.generation || this.accountId !== accountId) return false;
        // Reconnect the relay without detaching the host binding or its tasks.
        this.connect(apiUrl);
        return true;
      } catch (error) {
        if (generation !== this.generation || this.accountId !== accountId) return false;
        const failure =
          error && typeof error === "object"
            ? (error as { code?: string; data?: { error?: { code?: string } } })
            : {};
        if (failure.data?.error?.code === "DEVICE_REVOKED") await this.enable(accountId, false);
        else if (failure.code === "UNAUTHORIZED" || failure.data?.error?.code === "AUTH_REQUIRED")
          await this.detach();
        else {
          this.error = "NETWORK_UNAVAILABLE";
          this.scheduleRenewal(false);
        }
        return false;
      }
    })();
    this.renewing = pending;
    void pending.finally(() => {
      if (this.renewing === pending) this.renewing = undefined;
    });
    return pending;
  }
  private async message(frame: RelayServerFrame, generation: number) {
    const binding = this.binding;
    if (!binding) return;
    if (frame.type === "ready") {
      const [replay, projects, capabilities] = await Promise.all([
        this.engine.request("agents.replay", { binding, after: 0 }) as Promise<{
          streamId: string;
          sequence: number;
        }>,
        this.engine.request("agents.projects", {}) as Promise<DeviceProject[]>,
        this.engine.request("agents.capabilities", {}) as Promise<AgentCapability[]>,
      ]);
      if (generation !== this.generation) return;
      const info = (await this.engine.request("agents.events", { binding })) as {
        instanceId: string;
      };
      if (generation !== this.generation) return;
      this.connection?.send({
        type: "announce",
        streamId: replay.streamId,
        instanceId: info.instanceId,
        projects,
        capabilities,
      });
    } else if (frame.type === "resume") {
      this.cursor = frame.sequence;
      this.streamId = frame.streamId;
      this.snapshotNeeded ||= frame.snapshot;
      this.ready = true;
      await this.wake();
    } else if (frame.type === "ack") {
      const pending = this.acknowledgement;
      if (
        pending &&
        frame.streamId === this.streamId &&
        frame.sequence === pending.sequence &&
        frame.snapshotId === pending.snapshotId
      )
        pending.resolve();
    } else if (frame.type === "command") {
      if (this.detaching) {
        this.connection?.send({
          type: "result",
          routeId: frame.routeId,
          result: { ok: false, code: "REQUEST_CLOSED" },
        });
        return;
      }
      const result = (await this.engine.request("agents.remote", {
        binding,
        command: frame.command,
      })) as { ok: true; value: unknown } | { ok: false; code: string };
      if (generation !== this.generation) return;
      await this.wake();
      while (this.syncing && generation === this.generation) await this.syncing;
      if (generation === this.generation)
        this.connection?.send({ type: "result", routeId: frame.routeId, result });
    } else if (frame.type === "error") {
      this.error = frame.code;
      if (frame.code === "AUTH_REQUIRED") this.scheduleRenewal();
      if (frame.code === "ACTIVITY_BASE_MISMATCH") this.snapshotNeeded = true;
    }
  }
  private waitForAck(sequence: number, snapshotId?: string) {
    return new Promise<void>((resolve, reject) => {
      const finish = (error: boolean) => {
        const pending = this.acknowledgement;
        if (!pending) return;
        clearTimeout(pending.timer);
        this.acknowledgement = undefined;
        if (error) reject(new Error("NETWORK_UNAVAILABLE"));
        else resolve();
      };
      this.acknowledgement = {
        sequence,
        ...(snapshotId ? { snapshotId } : {}),
        resolve: () => finish(false),
        reject: () => finish(true),
        timer: setTimeout(() => finish(true), 10_000),
      };
    });
  }
  wake(): Promise<void> {
    this.dirty = true;
    if (this.syncing) return this.syncing;
    if (!this.ready || !this.binding) return Promise.resolve();
    const generation = this.generation;
    const operation = this.flush(generation)
      .catch(() => {
        if (generation === this.generation) {
          this.error = "NETWORK_UNAVAILABLE";
          this.connection?.restart();
        }
      })
      .finally(() => {
        if (this.syncing === operation) this.syncing = undefined;
        if (this.dirty && this.ready) void this.wake();
      });
    this.syncing = operation;
    return operation;
  }
  private async flush(generation: number) {
    const binding = this.binding!;
    while (this.ready && generation === this.generation) {
      this.dirty = false;
      if (this.snapshotNeeded) {
        let id: string | undefined,
          offset = 0,
          ack: Promise<void> | undefined;
        for (;;) {
          const page = (await this.engine.request("agents.snapshot", {
            binding,
            ...(id ? { id } : {}),
            offset,
          })) as {
            id: string;
            streamId: string;
            sequence: number;
            records: SnapshotRecord[];
            next: number;
            done: boolean;
          };
          if (generation !== this.generation) return;
          if (!id) {
            id = page.id;
            ack = this.waitForAck(page.sequence, id);
            void ack.catch(() => {});
          }
          this.connection?.send({
            type: "snapshot",
            id: page.id,
            streamId: page.streamId,
            sequence: page.sequence,
            records: page.records,
            done: page.done,
          });
          offset = page.next;
          if (page.done) {
            await ack;
            this.cursor = page.sequence;
            this.snapshotNeeded = false;
            break;
          }
        }
      }
      const replay = (await this.engine.request("agents.replay", {
        binding,
        after: this.cursor,
      })) as { streamId: string; sequence: number; floor: number; events: SequencedEvent[] };
      if (generation !== this.generation) return;
      if (
        replay.streamId !== this.streamId ||
        this.cursor > replay.sequence ||
        replay.floor > this.cursor + 1
      ) {
        this.snapshotNeeded = true;
        continue;
      }
      if (!replay.events.length) {
        await this.engine.request("agents.checkpoint", { binding, sequence: this.cursor });
        if (generation !== this.generation) return;
        this.connection?.send({ type: "available" });
        this.connected = true;
        this.renewalFailures = 0;
        this.renewAt = 0;
        this.error = null;
        if (!this.dirty) return;
        continue;
      }
      const last = replay.events.at(-1)!;
      const ack = this.waitForAck(last.sequence);
      void ack.catch(() => {});
      this.connection?.send({ type: "events", streamId: this.streamId, events: replay.events });
      await ack;
      this.cursor = last.sequence;
      await this.engine.request("agents.checkpoint", { binding, sequence: this.cursor });
      for (const { event } of replay.events)
        if (
          event.kind === "request" &&
          event.request.status === "pending" &&
          !this.notified.has(event.id)
        ) {
          this.notified.add(event.id);
          this.notify();
        }
    }
  }
  async detach() {
    clearTimeout(this.renewalTimer);
    this.renewalTimer = undefined;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    const binding = this.binding;
    this.detaching = true;
    if (binding) {
      await this.engine.request("agents.detach", { binding }).catch(() => {});
      if (this.ready)
        await Promise.race([
          this.wake(),
          new Promise<void>((resolve) => setTimeout(resolve, 2000)),
        ]);
    }
    this.resetConnection();
    this.binding = undefined;
    this.grant = undefined;
    this.apiUrl = undefined;
    this.accountId = null;
    this.error = null;
    this.detaching = false;
    this.dirty = false;
  }
}
