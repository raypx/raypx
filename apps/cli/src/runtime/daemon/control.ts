import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { createApiClient } from "@raypx/client";
import { RemoteControl, serverOrigin, type ControlInfo } from "@raypx/host";
import { localParams, type LocalEvent, type LocalMethod } from "@raypx/contracts/local";
import {
  hostAuthorizationSchema,
  type HostAuthorization,
  type TerminalRequest,
  type ObservedProjection,
} from "@raypx/contracts/terminal";
import type { RelayClientFrame } from "@raypx/contracts/tasks";
import type { LocalRuntime } from "../index";
import { LocalError } from "../errors";
import { startTerminalHost } from "../terminal/host";
import {
  bindingKey,
  createHostVault,
  hostBindingSchema,
  type HostBinding,
  type HostVault,
} from "./vault";
import { connectorAction, connectorStatus } from "./connectors";

const settingsSchema = z.object({
  rootIds: z.array(z.string().uuid()).max(200),
  away: z.boolean(),
  waitSeconds: z.number().int().min(60).max(600),
});
type Settings = z.infer<typeof settingsSchema>;
type Scope = { accountId: string; apiUrl: string };
export function terminalProjectPaths(roots: { id: string; path: string }[]) {
  const paths = new Map<string, string>();
  for (const root of roots) {
    try {
      // Grants record canonical paths. A replacement symlink must not silently
      // authorize another directory, and one missing project must not stop relay.
      if (realpathSync(root.path) === root.path && statSync(root.path).isDirectory())
        paths.set(root.path, root.id);
    } catch {
      /* Missing/unavailable grants remain opted out until restored. */
    }
  }
  return paths;
}
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
  private retry: ReturnType<typeof setTimeout> | undefined;
  private terminal: ReturnType<typeof startTerminalHost> | undefined;
  private revision = 0;
  private readonly dirty = new Map<string, TerminalRequest>();
  private ack: { epoch: string; revision: number; resolve(): void; reject(): void } | undefined;
  private queue = Promise.resolve();
  private closing = false;
  constructor(
    private readonly directory: string,
    private readonly runtime: LocalRuntime,
    private readonly emit: (event: LocalEvent) => void,
    vault?: HostVault,
  ) {
    this.vault = vault ?? createHostVault();
  }
  private scope(value: Scope): Scope {
    return { accountId: value.accountId, apiUrl: serverOrigin(value.apiUrl) };
  }
  private isCurrent(scope: Scope) {
    return this.current?.apiUrl === scope.apiUrl && this.current.accountId === scope.accountId;
  }
  private path(scope: Scope) {
    const path = join(this.directory, "hosts", bindingKey(scope.apiUrl, scope.accountId));
    mkdirSync(path, { recursive: true, mode: 0o700 });
    return path;
  }
  private settings(scope: Scope): Settings {
    const file = join(this.path(scope), "observed.json");
    if (!existsSync(file)) return { rootIds: [], away: false, waitSeconds: 300 };
    const source = readFileSync(file, "utf8");
    if (source.length > 32_000)
      throw new LocalError("SETTINGS_UNAVAILABLE", "Terminal settings require recovery");
    return settingsSchema.parse(JSON.parse(source));
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
        bindingKey: (accountId, grant) =>
          remoteBinding({ ...grant, accountId, apiUrl: scope.apiUrl }),
        renewGrant: async () => {
          const current = this.current;
          if (!current || !this.isCurrent(scope))
            throw new LocalError("AUTH_REQUIRED", "Host authorization is unavailable");
          return this.grant(current);
        },
        syncObserved: (send) => this.syncObserved(scope, send),
        observedAck: (epoch, revision) => {
          if (this.ack?.epoch === epoch && this.ack.revision === revision) this.ack.resolve();
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
      { signal: AbortSignal.timeout(10_000) },
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
    return this.serial(async () => {
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
          if (value.accountId !== binding.accountId || value.apiUrl !== binding.apiUrl) return;
        }
        if (
          !this.control(binding).info(binding.accountId).enabled ||
          !(await this.vault.get(binding))
        )
          return;
        this.current = binding;
        this.persistent = true;
        await this.startTerminal(binding);
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
      const code =
        error && typeof error === "object" && "data" in error
          ? (error as { data?: { error?: { code?: string } } }).data?.error?.code
          : undefined;
      if (code === "AUTH_REQUIRED" || code === "DEVICE_REVOKED") {
        await this.detachCurrent();
        return;
      }
      if (this.isCurrent(binding) && !this.closing)
        this.retry = setTimeout(() => {
          this.retry = undefined;
          void this.reconnect(binding);
        }, 15_000);
    }
  }
  info(scope: Scope): ControlInfo {
    return {
      ...this.control(scope).info(scope.accountId),
      daemon: true,
      persistent: this.isCurrent(scope) && this.persistent,
      authorized: this.isCurrent(scope),
    };
  }
  private async authorize(scope: Scope, raw: HostAuthorization) {
    const authorization = hostAuthorizationSchema.parse(raw);
    if (
      authorization.accountId !== scope.accountId ||
      Date.parse(authorization.expiresAt) <= Date.now()
    )
      throw new LocalError("AUTH_REQUIRED", "Invalid host authorization");
    const selected = join(this.directory, "host-session.json");
    if (existsSync(selected)) {
      const value = localParams["host.session"].parse(JSON.parse(readFileSync(selected, "utf8")));
      if (value.accountId !== scope.accountId || value.apiUrl !== scope.apiUrl)
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
    const previous = this.current;
    if (previous && remoteBinding(previous) !== remoteBinding(binding)) await this.detachCurrent();
    this.current = binding;
    writeJson(join(this.directory, "host-binding.json"), binding);
    const control = this.control(scope);
    await control.enable(scope.accountId, true);
    await this.startTerminal(binding);
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
    this.persistent = false;
    this.ack?.reject();
    this.ack = undefined;
    await this.terminal?.close();
    this.terminal = undefined;
    this.dirty.clear();
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
  private async startTerminal(scope: Scope) {
    this.ack?.reject();
    this.ack = undefined;
    await this.terminal?.close();
    this.terminal = undefined;
    this.dirty.clear();
    this.revision = 0;
    const settings = this.settings(scope),
      roots = this.runtime.state.roots().filter((root) => settings.rootIds.includes(root.id));
    const paths = terminalProjectPaths(roots);
    this.terminal = startTerminalHost({
      directory: this.path(scope),
      discoveryDirectory: this.directory,
      projects: [...paths.keys()],
      projectIds: paths,
      away: settings.away,
      waitSeconds: settings.waitSeconds,
      reachable: () => this.isCurrent(scope) && this.control(scope).info(scope.accountId).connected,
      authorizeProject: (path, provider) => {
        const id = paths.get(path);
        return Boolean(
          id &&
          this.runtime.agents.projectProviders(id).includes(provider) &&
          this.runtime.state.roots().some((root) => {
            try {
              return root.id === id && realpathSync(root.path) === path;
            } catch {
              return false;
            }
          }),
        );
      },
      changed: (request) => {
        this.dirty.set(request.id, request);
        this.emit({
          version: 1,
          event: "observed.changed",
          data: request.status === "pending" ? { pendingRequest: request.id } : {},
        });
      },
    });
    for (const request of this.terminal.broker.list(256)) this.dirty.set(request.id, request);
  }
  private async syncObserved(
    scope: Scope,
    send: (frame: Extract<RelayClientFrame, { type: "observed" }>) => void,
  ) {
    while (this.isCurrent(scope) && this.terminal && this.dirty.size) {
      const terminal = this.terminal,
        requests = [...this.dirty.values()].slice(0, 5),
        ids = new Set(requests.map((request) => request.sessionId));
      const sessions = terminal.sessions().filter((session) => ids.has(session.id));
      if (sessions.length !== ids.size) {
        for (const request of requests) this.dirty.delete(request.id);
        continue;
      }
      const revision = ++this.revision;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (this.ack?.revision === revision) this.ack = undefined;
          reject(new LocalError("NETWORK_UNAVAILABLE", "Terminal synchronization timed out"));
        }, 10_000);
        this.ack = {
          epoch: terminal.broker.epoch,
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
          send({ type: "observed", epoch: terminal.broker.epoch, revision, sessions, requests });
        } catch {
          this.ack?.reject();
        }
      });
      for (const request of requests)
        if (this.dirty.get(request.id)?.revision === request.revision)
          this.dirty.delete(request.id);
    }
  }
  wake() {
    return this.current ? this.control(this.current).wake() : Promise.resolve();
  }
  async projectsChanged() {
    if (this.current)
      await this.serial(() =>
        this.current ? this.startTerminal(this.current) : Promise.resolve(),
      );
  }
  private decide(input: unknown) {
    if (!this.terminal || !this.current)
      throw new LocalError("REQUEST_CLOSED", "Terminal binding is unavailable");
    const decision = localParams["observed.remote"].shape.decision.parse(input),
      request = this.terminal.broker.get(decision.id);
    if (request?.status === "pending") {
      const session = this.terminal.sessions().find((value) => value.id === request.sessionId),
        settings = this.settings(this.current);
      const root = session
        ? this.runtime.state.roots().find((value) => value.id === session.projectId)
        : undefined;
      if (
        !root ||
        !terminalProjectPaths([root]).has(root.path) ||
        !settings.rootIds.includes(root.id) ||
        !this.runtime.agents.projectProviders(root.id).includes(request.provider)
      ) {
        this.terminal.broker.cancel(request.id, "unavailable");
        throw new LocalError("REQUEST_CLOSED", "Project authorization changed");
      }
    }
    return this.terminal.broker.decide(decision);
  }
  async request(method: LocalMethod, raw: unknown): Promise<unknown> {
    if (this.closing) throw new LocalError("CLOSING", "Daemon is stopping");
    if (method === "host.session") {
      const input = localParams[method].parse(raw);
      return this.serial(() => this.selectAccount(input));
    }
    if (method === "connectors.status") return connectorStatus(this.directory);
    if (method === "connectors.install" || method === "connectors.uninstall")
      return this.serial(() =>
        connectorAction(
          this.directory,
          localParams[method].parse(raw).provider,
          method === "connectors.install" ? "install" : "uninstall",
        ),
      );
    if (method === "observed.remote") {
      const input = localParams[method].parse(raw);
      if (!this.current || input.binding !== remoteBinding(this.current) || !this.terminal)
        throw new LocalError("REQUEST_CLOSED", "Terminal binding is no longer active");
      return this.decide(input.decision);
    }
    if (method === "host.info") return this.info(this.scope(localParams[method].parse(raw)));
    if (method === "host.refresh") {
      const scope = this.scope(localParams[method].parse(raw));
      return this.isCurrent(scope) ? this.control(scope).refreshGrant() : false;
    }
    if (method === "host.enable") {
      const input = localParams[method].parse(raw),
        scope = this.scope(input);
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
      return this.serial(async () => ({
        ...this.control(scope).revoked(scope.accountId),
        daemon: true,
        persistent: this.isCurrent(scope) && this.persistent,
      }));
    }
    if (method === "host.authorize") {
      const input = localParams[method].parse(raw);
      return this.serial(() => this.authorize(this.scope(input), input.authorization));
    }
    if (method === "host.detach") {
      const scope = this.scope(localParams[method].parse(raw));
      return this.serial(async () => {
        if (this.isCurrent(scope)) await this.detachCurrent();
        return true;
      });
    }
    if (method === "observed.settings") {
      const scope = this.scope(localParams[method].parse(raw));
      return { ...this.settings(scope), connected: this.info(scope).connected };
    }
    if (method === "observed.configure") {
      const input = localParams[method].parse(raw),
        scope = this.scope(input);
      return this.serial(async () => {
        if (!this.isCurrent(scope))
          throw new LocalError(
            "AUTH_REQUIRED",
            "Enable remote access before terminal synchronization",
          );
        for (const id of input.rootIds) {
          this.runtime.state.root(id);
          if (!this.runtime.agents.projectProviders(id).length)
            throw new LocalError("PROJECT_NOT_AUTHORIZED", "Enable this Agent project first");
        }
        const settings = settingsSchema.parse({ ...input, rootIds: [...new Set(input.rootIds)] });
        writeJson(join(this.path(scope), "observed.json"), settings);
        await this.startTerminal(scope);
        void this.wake();
        return settings;
      });
    }
    if (method === "observed.list") {
      const scope = this.scope(localParams[method].parse(raw));
      if (!this.isCurrent(scope) || !this.terminal || !this.current)
        return { sessions: [], requests: [] };
      const deviceId = this.current.deviceId;
      return {
        sessions: this.terminal
          .sessions()
          .map((session) => ({ ...session, deviceId, deviceName: this.info(scope).name }))
          .slice(-100),
        requests: this.terminal.broker
          .list()
          .map(({ body: _body, questions: _questions, decision: _decision, ...request }) => ({
            ...request,
            deviceId,
          })),
      } satisfies ObservedProjection;
    }
    if (method === "observed.get") {
      const input = localParams[method].parse(raw),
        scope = this.scope(input);
      const request = this.isCurrent(scope) ? this.terminal?.broker.get(input.id) : undefined;
      if (!request) throw new LocalError("NOT_FOUND", "Terminal request unavailable");
      return request;
    }
    if (method === "observed.decide") {
      const input = localParams[method].parse(raw),
        scope = this.scope(input);
      if (!this.isCurrent(scope) || !this.terminal)
        throw new LocalError("REQUEST_CLOSED", "Terminal binding is unavailable");
      return this.decide(input.decision);
    }
    throw new LocalError("INVALID_METHOD", "Unknown daemon control method");
  }
  async close() {
    clearTimeout(this.retry);
    this.retry = undefined;
    this.closing = true;
    await this.queue;
    this.ack?.reject();
    this.ack = undefined;
    await this.terminal?.close();
    this.terminal = undefined;
    for (const control of this.controls.values()) await control.detach();
  }
}
