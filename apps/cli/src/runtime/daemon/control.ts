import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApiClient, isMissingProcedure } from "@raypx/client";
import { RemoteControl, serverOrigin, type ControlInfo } from "@raypx/host";
import { localParams, type LocalEvent, type LocalMethod } from "@raypx/contracts/local";
import { hostAuthorizationSchema, type HostAuthorization } from "@raypx/contracts/terminal";
import type { RelayClientFrame } from "@raypx/contracts/tasks";
import type { LocalRuntime } from "../index";
import { LocalError } from "../errors";
import type { LocalTerminalControl } from "./terminal-control";
import {
  bindingKey,
  createHostVault,
  hostBindingSchema,
  type HostBinding,
  type HostVault,
} from "./vault";

type Scope = { accountId: string; apiUrl: string };
export { terminalProjectPaths } from "./terminal-control";
const remoteBinding = (binding: HostBinding) =>
  `host:${bindingKey(binding.apiUrl, binding.accountId)}:${binding.deviceId}:${binding.epoch}`;
const writeJson = (file: string, value: unknown) => {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 });
  renameSync(temporary, file);
};

/** Owns one explicitly selected origin/account binding independently of every GUI. */
export class DaemonControl {
  private readonly vault: HostVault;
  private readonly controls = new Map<string, RemoteControl>();
  private current: HostBinding | undefined;
  private persistent = false;
  private legacy = false;
  private readonly authorizationErrors = new Map<string, string>();
  private retry: ReturnType<typeof setTimeout> | undefined;
  private revision = 0;
  private observedInitialized = false;
  private connectionGeneration = 0;
  private readonly network = new AbortController();
  private ack:
    | {
        binding: string;
        generation: number;
        epoch: string;
        revision: number;
        resolve(): void;
        reject(): void;
      }
    | undefined;
  private selectionGeneration = 0;
  private queue = Promise.resolve();
  private closing = false;
  constructor(
    private readonly directory: string,
    private readonly runtime: LocalRuntime,
    private readonly emit: (event: LocalEvent) => void,
    private readonly terminal: LocalTerminalControl,
    vault?: HostVault,
  ) {
    this.vault = vault ?? createHostVault();
    this.terminal.onCloudChange(() => {
      void this.wake().catch(() => this.backgroundFailure());
    });
  }
  private scope(value: Scope): Scope {
    return { accountId: value.accountId, apiUrl: serverOrigin(value.apiUrl) };
  }
  private selectedScope(scope: Scope) {
    try {
      const source = readFileSync(join(this.directory, "host-session.json"), "utf8");
      if (source.length > 8192) throw new Error("Invalid selection");
      const selected = localParams["host.session"].parse(JSON.parse(source));
      if (selected.accountId === scope.accountId && serverOrigin(selected.apiUrl) === scope.apiUrl)
        return scope;
    } catch {
      /* Missing/corrupt selection cannot authorize a different cloud scope. */
    }
    throw new LocalError("AUTH_REQUIRED", "Select this cloud account first");
  }
  private isCurrent(scope: Scope) {
    return this.current?.apiUrl === scope.apiUrl && this.current.accountId === scope.accountId;
  }
  private path(scope: Scope) {
    const path = join(this.directory, "hosts", bindingKey(scope.apiUrl, scope.accountId));
    mkdirSync(path, { recursive: true, mode: 0o700 });
    return path;
  }
  private serial<T>(run: () => Promise<T>): Promise<T> {
    const operation = this.queue.then(run);
    this.queue = operation.then(
      () => {},
      () => {},
    );
    return operation;
  }
  private control(scope: Scope) {
    const key = bindingKey(scope.apiUrl, scope.accountId),
      old = this.controls.get(key);
    if (old) return old;
    const control = new RemoteControl(
      this.path(scope),
      {
        request: (method, params) =>
          method === "observed.remote"
            ? this.request(method, params)
            : this.runtime.request(method, params),
      },
      () =>
        this.emit({
          version: 1,
          event: "agent.changed",
          data: { pendingRequest: "remote", notificationOnly: true },
        }),
      () => this.emit({ version: 1, event: "sync.grantRequired", data: {} }),
      {
        protocolVersion: 3,
        connected: () => {
          if (this.current && this.isCurrent(scope))
            this.terminal.connected(remoteBinding(this.current));
        },
        authorizationLost: (code) => {
          const expected = this.current;
          if (this.isCurrent(scope)) this.terminal.detachCloud();
          return this.serial(async () => {
            if (!expected || this.current !== expected || !this.isCurrent(scope)) return;
            try {
              await this.detachCurrent();
            } finally {
              this.authorizationErrors.set(key, code);
              this.emit({ version: 1, event: "sync.grantRequired", data: {} });
              this.emit({ version: 1, event: "observed.changed", data: {} });
            }
          });
        },
        bindingKey: (accountId, grant) =>
          remoteBinding({ ...grant, accountId, apiUrl: scope.apiUrl }),
        renewGrant: async () => {
          if (this.legacy) {
            this.emit({ version: 1, event: "sync.grantRequired", data: {} });
            throw new LocalError("NETWORK_UNAVAILABLE", "Legacy server renewal requires Desktop");
          }
          const current = this.current;
          if (!current || !this.isCurrent(scope))
            throw new LocalError("AUTH_REQUIRED", "Host authorization is unavailable");
          return this.grant(current);
        },
        syncObserved: (send) => this.syncObserved(scope, send),
        observedReset: () => {
          this.ack?.reject();
          this.ack = undefined;
          this.connectionGeneration++;
          this.observedInitialized = false;
        },
        observedAck: (epoch, revision) => {
          if (
            this.current &&
            this.isCurrent(scope) &&
            this.ack?.binding === remoteBinding(this.current) &&
            this.ack.generation === this.connectionGeneration &&
            this.ack.epoch === epoch &&
            this.ack.revision === revision
          )
            this.ack.resolve();
        },
      },
    );
    this.controls.set(key, control);
    return control;
  }
  private async grant(binding: HostBinding) {
    const authorization = await this.vault.get(binding);
    if (!authorization || Date.parse(authorization.expiresAt) <= Date.now())
      throw Object.assign(
        new LocalError("AUTH_REQUIRED", "Authorize this daemon again in Desktop"),
        { data: { error: { code: "AUTH_REQUIRED" } } },
      );
    const response = await createApiClient({ baseUrl: binding.apiUrl }).hosts.grant(
      { credential: authorization.credential },
      { signal: AbortSignal.any([this.network.signal, AbortSignal.timeout(10_000)]) },
    );
    if (
      response.accountId !== binding.accountId ||
      response.grant.deviceId !== binding.deviceId ||
      response.grant.epoch !== binding.epoch
    )
      throw new LocalError("AUTH_REQUIRED", "Host credential does not match this server binding");
    return response.grant;
  }
  restore() {
    const generation = this.selectionGeneration;
    return this.serial(async () => {
      if (this.closing || generation !== this.selectionGeneration) return;
      const file = join(this.directory, "host-binding.json");
      if (!existsSync(file)) return;
      try {
        const source = readFileSync(file, "utf8");
        if (source.length > 8192) return;
        const binding = hostBindingSchema.parse(JSON.parse(source));
        binding.apiUrl = serverOrigin(binding.apiUrl);
        const selected = join(this.directory, "host-session.json");
        if (existsSync(selected)) {
          const value = localParams["host.session"].parse(
            JSON.parse(readFileSync(selected, "utf8")),
          );
          if (
            value.accountId !== binding.accountId ||
            serverOrigin(value.apiUrl) !== binding.apiUrl
          )
            return;
        }
        if (
          !this.control(binding).info(binding.accountId).enabled ||
          !(await this.vault.get(binding))
        )
          return;
        if (this.closing || generation !== this.selectionGeneration) return;
        this.current = binding;
        this.persistent = true;
        this.attachTerminal(binding);
        await this.reconnect(binding);
      } catch {
        /* Remain unavailable without replaying work or changing origins. */
      }
    });
  }
  private async reconnect(binding: HostBinding) {
    if (this.closing || this.current !== binding) return;
    try {
      const grant = await this.grant(binding);
      if (!this.closing && this.current === binding)
        await this.control(binding).attach(binding.accountId, binding.apiUrl, grant);
    } catch (error) {
      if (this.closing || this.current !== binding) return;
      const code = isMissingProcedure(error)
        ? "NOT_FOUND"
        : error && typeof error === "object"
          ? ((error as { data?: { error?: { code?: string } } }).data?.error?.code ??
            (error as { code?: string }).code)
          : undefined;
      if (
        code === "AUTH_REQUIRED" ||
        code === "DEVICE_REVOKED" ||
        code === "UNAUTHORIZED" ||
        code === "NOT_FOUND"
      ) {
        await this.detachCurrent();
        this.authorizationErrors.set(
          bindingKey(binding.apiUrl, binding.accountId),
          code === "NOT_FOUND" ? "UPGRADE_REQUIRED" : code,
        );
        this.emit({ version: 1, event: "sync.grantRequired", data: {} });
        return;
      }
      if (this.isCurrent(binding) && !this.closing)
        this.retry = setTimeout(() => {
          this.retry = undefined;
          void this.reconnect(binding).catch(() => this.backgroundFailure());
        }, 15_000);
    }
  }
  info(scope: Scope): ControlInfo {
    return {
      ...this.control(scope).info(scope.accountId),
      daemon: true,
      persistent: this.isCurrent(scope) && this.persistent,
      authorized: this.isCurrent(scope) && !this.legacy,
      legacy: this.isCurrent(scope) && this.legacy,
      ...(this.authorizationErrors.has(bindingKey(scope.apiUrl, scope.accountId))
        ? { error: this.authorizationErrors.get(bindingKey(scope.apiUrl, scope.accountId))! }
        : {}),
    };
  }
  private async authorize(scope: Scope, raw: HostAuthorization, generation: number) {
    const authorization = hostAuthorizationSchema.parse(raw);
    if (
      authorization.accountId !== scope.accountId ||
      Date.parse(authorization.expiresAt) <= Date.now()
    )
      throw new LocalError("AUTH_REQUIRED", "Invalid host authorization");
    const selected = join(this.directory, "host-session.json");
    if (existsSync(selected)) {
      const value = localParams["host.session"].parse(JSON.parse(readFileSync(selected, "utf8")));
      if (value.accountId !== scope.accountId || serverOrigin(value.apiUrl) !== scope.apiUrl)
        throw new LocalError("AUTH_REQUIRED", "Account selection changed before authorization");
    }
    clearTimeout(this.retry);
    this.retry = undefined;
    if (this.current && !this.isCurrent(scope)) await this.detachCurrent();
    const binding: HostBinding = {
      accountId: scope.accountId,
      apiUrl: scope.apiUrl,
      deviceId: authorization.deviceId,
      epoch: authorization.epoch,
      expiresAt: authorization.expiresAt,
    };
    this.persistent = await this.vault.set(binding, authorization);
    const grant = await this.grant(binding);
    if (this.closing || generation !== this.selectionGeneration)
      throw new LocalError("AUTH_REQUIRED", "Account selection changed");
    const previous = this.current;
    if (previous && remoteBinding(previous) !== remoteBinding(binding)) await this.detachCurrent();
    this.current = binding;
    this.legacy = false;
    this.authorizationErrors.delete(bindingKey(scope.apiUrl, scope.accountId));
    writeJson(join(this.directory, "host-binding.json"), binding);
    const control = this.control(scope);
    await control.enable(scope.accountId, true);
    this.attachTerminal(binding);
    await control.attach(scope.accountId, scope.apiUrl, grant);
    return this.info(scope);
  }
  private async detachCurrent() {
    clearTimeout(this.retry);
    this.retry = undefined;
    const current = this.current;
    if (!current) return;
    const authorization = await this.vault.get(current);
    this.current = undefined;
    this.legacy = false;
    this.persistent = false;
    this.ack?.reject();
    this.ack = undefined;
    this.terminal.detachCloud();
    this.observedInitialized = false;
    await this.control(current).detach();
    if (authorization)
      await createApiClient({ baseUrl: current.apiUrl })
        .hosts.revoke(
          { credential: authorization.credential },
          { signal: AbortSignal.timeout(3000) },
        )
        .catch(() => {});
    await this.vault.remove(current);
    rmSync(join(this.directory, "host-binding.json"), { force: true });
  }
  private async selectAccount(scope: { accountId: string | null; apiUrl: string }) {
    const file = join(this.directory, "host-session.json"),
      next = { accountId: scope.accountId, apiUrl: serverOrigin(scope.apiUrl) };
    const previous = existsSync(file)
      ? localParams["host.session"].parse(JSON.parse(readFileSync(file, "utf8")))
      : undefined;
    writeJson(file, next);
    if (previous) {
      const old = previous;
      if (old.accountId && (old.accountId !== next.accountId || old.apiUrl !== next.apiUrl)) {
        const origin = createHash("sha256").update(old.apiUrl).digest("hex").slice(0, 32),
          account = createHash("sha256").update(old.accountId).digest("hex").slice(0, 32);
        await this.runtime.request("agents.local.detach", {
          accountId: `server:${origin}:${account}`,
        });
      }
    }
    if (
      this.current &&
      (this.current.accountId !== next.accountId || this.current.apiUrl !== next.apiUrl)
    )
      await this.detachCurrent();
    return true;
  }
  private attachTerminal(binding: HostBinding) {
    this.terminal.attachCloud({
      binding: remoteBinding(binding),
      accountId: binding.accountId,
      apiUrl: binding.apiUrl,
      supported: () => this.control(binding).info(binding.accountId).terminalSupported !== false,
      connected: () => {
        const info = this.control(binding).info(binding.accountId);
        return this.isCurrent(binding) && info.connected && info.terminalSupported !== false;
      },
    });
  }
  private async syncObserved(
    scope: Scope,
    send: (frame: Extract<RelayClientFrame, { type: "observed" }>) => void,
  ) {
    const generation = this.connectionGeneration;
    while (
      this.current &&
      this.isCurrent(scope) &&
      generation === this.connectionGeneration &&
      this.terminal.epoch
    ) {
      const binding = remoteBinding(this.current),
        epoch = this.terminal.epoch;
      const initial = !this.observedInitialized;
      const batch = initial ? { sessions: [], requests: [] } : this.terminal.projection(binding);
      if (!initial && !batch.requests.length) return;
      const revision = ++this.revision;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (this.ack?.revision === revision) this.ack = undefined;
          reject(new LocalError("NETWORK_UNAVAILABLE", "Terminal synchronization timed out"));
        }, 10_000);
        this.ack = {
          binding,
          generation,
          epoch,
          revision,
          resolve: () => {
            clearTimeout(timeout);
            this.ack = undefined;
            resolve();
          },
          reject: () => {
            clearTimeout(timeout);
            this.ack = undefined;
            reject(new LocalError("NETWORK_UNAVAILABLE", "Terminal channel disconnected"));
          },
        };
        try {
          this.terminal.sent(binding, batch.requests);
          send({ type: "observed", epoch, revision, ...batch });
        } catch {
          this.ack?.reject();
        }
      }).catch((error: unknown) => {
        // Retiring a connection rejects its waiter. Do not let that old failure
        // reconnect or invalidate the replacement connection that just resumed.
        if (
          this.closing ||
          generation !== this.connectionGeneration ||
          !this.current ||
          remoteBinding(this.current) !== binding
        )
          return;
        throw error;
      });
      if (
        generation !== this.connectionGeneration ||
        !this.current ||
        remoteBinding(this.current) !== binding
      )
        return;
      this.observedInitialized = true;
      this.terminal.acknowledged(binding, batch.requests);
    }
  }
  private backgroundFailure() {
    console.error(JSON.stringify({ operation: "daemon.background", code: "BACKGROUND_FAILED" }));
  }
  wake() {
    return this.current ? this.control(this.current).wake() : Promise.resolve();
  }
  async projectsChanged() {
    this.terminal.projectsChanged();
    await this.wake();
  }
  async request(method: LocalMethod, raw: unknown): Promise<unknown> {
    if (this.closing) throw new LocalError("CLOSING", "Daemon is stopping");
    if (method === "host.session") {
      const input = localParams[method].parse(raw);
      this.selectionGeneration++;
      if (
        this.current &&
        (input.accountId !== this.current.accountId ||
          serverOrigin(input.apiUrl) !== this.current.apiUrl)
      )
        this.terminal.detachCloud();
      return this.serial(() => this.selectAccount(input));
    }
    if (method === "observed.remote") {
      const input = localParams[method].parse(raw);
      if (!this.current || input.binding !== remoteBinding(this.current))
        throw new LocalError("REQUEST_CLOSED", "Terminal binding is no longer active");
      return this.terminal.remoteDecision(input.binding, input.decision);
    }
    if (method === "host.info") return this.info(this.scope(localParams[method].parse(raw)));
    if (method === "host.refresh") {
      const scope = this.scope(localParams[method].parse(raw));
      return this.isCurrent(scope) ? this.control(scope).refreshGrant() : false;
    }
    if (method === "host.enable") {
      const input = localParams[method].parse(raw),
        scope = this.scope(input);
      if (!input.enabled && this.isCurrent(scope)) {
        this.selectionGeneration++;
        this.terminal.detachCloud();
      }
      return this.serial(async () => {
        if (!input.enabled && this.isCurrent(scope)) await this.detachCurrent();
        return {
          ...(await this.control(scope).enable(scope.accountId, input.enabled)),
          daemon: true,
          persistent: this.isCurrent(scope) && this.persistent,
        };
      });
    }
    if (method === "host.revoked") {
      const scope = this.scope(localParams[method].parse(raw));
      if (this.isCurrent(scope)) {
        this.selectionGeneration++;
        this.terminal.detachCloud();
      }
      return this.serial(async () => {
        if (this.isCurrent(scope)) await this.detachCurrent();
        return { ...this.control(scope).revoked(scope.accountId), daemon: true, persistent: false };
      });
    }
    if (method === "host.legacy") {
      const input = localParams[method].parse(raw),
        scope = this.scope(input);
      return this.serial(async () => {
        const binding: HostBinding = {
          ...scope,
          deviceId: input.grant.deviceId,
          epoch: input.grant.epoch,
          expiresAt: input.grant.expiresAt,
        };
        if (this.current && remoteBinding(this.current) !== remoteBinding(binding))
          await this.detachCurrent();
        this.current = binding;
        this.legacy = true;
        this.persistent = false;
        this.authorizationErrors.delete(bindingKey(scope.apiUrl, scope.accountId));
        const control = this.control(scope);
        await control.enable(scope.accountId, true);
        await control.attach(scope.accountId, scope.apiUrl, input.grant);
        return this.info(scope);
      });
    }
    if (method === "host.authorize") {
      const input = localParams[method].parse(raw);
      const generation = this.selectionGeneration;
      return this.serial(() => this.authorize(this.scope(input), input.authorization, generation));
    }
    if (method === "host.detach") {
      const scope = this.scope(localParams[method].parse(raw));
      if (this.isCurrent(scope)) {
        this.selectionGeneration++;
        this.terminal.detachCloud();
      }
      return this.serial(async () => {
        if (this.isCurrent(scope)) await this.detachCurrent();
        return true;
      });
    }
    if (method === "host.terminal.settings")
      return this.terminal.cloudSettings(
        this.selectedScope(this.scope(localParams[method].parse(raw))),
      );
    if (method === "host.terminal.configure") {
      const input = localParams[method].parse(raw);
      const result = this.terminal.configureCloud(this.selectedScope(this.scope(input)), input);
      void this.wake().catch(() => this.backgroundFailure());
      return result;
    }
    throw new LocalError("INVALID_METHOD", "Unknown daemon control method");
  }
  async close() {
    clearTimeout(this.retry);
    this.retry = undefined;
    this.closing = true;
    this.network.abort();
    this.terminal.detachCloud();
    await this.queue;
    this.ack?.reject();
    this.ack = undefined;
    for (const control of this.controls.values()) await control.detach();
  }
}
