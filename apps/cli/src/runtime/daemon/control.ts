import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApiClient, isMissingProcedure } from "@raypx/client/api";
import { RemoteControl } from "./remote/control.ts";
import { AcknowledgedStream } from "./acknowledged-stream";
import { abortable } from "./cancellation";
import { failureCode } from "./remote/failure.ts";
import { serverOrigin } from "./remote/origin.ts";
import { localParams, type LocalEvent, type LocalMethod } from "@raypx/contracts/local";
import {
  hostAuthorizationSchema,
  type ControlInfo,
  type HostAuthorization,
} from "@raypx/contracts/terminal";
import type { RelayClientFrame } from "@raypx/contracts/tasks";
import type { LocalRuntime } from "../index.ts";
import { backgroundFailure } from "../background.ts";
import { LocalError } from "../errors.ts";
import { hostState, initialHostState, type HostEvent } from "./host-state.ts";
import type { LocalTerminalControl } from "./terminal-control.ts";
import {
  bindingKey,
  createHostVault,
  hostBindingSchema,
  type HostBinding,
  type HostVault,
} from "./vault.ts";

type Scope = { accountId: string; apiUrl: string };
type Selection = { accountId: string | null; apiUrl: string };
type ControlMethod = Extract<
  LocalMethod,
  | "host.session"
  | "observed.remote"
  | "host.info"
  | "host.refresh"
  | "host.enable"
  | "host.revoked"
  | "host.authorize"
  | "host.detach"
  | "host.terminal.settings"
  | "host.terminal.configure"
>;
type ControlInput<Method extends ControlMethod> = ReturnType<(typeof localParams)[Method]["parse"]>;
type ControlHandlers = {
  [Method in ControlMethod]: (input: ControlInput<Method>) => unknown;
};
/** Failures that end the binding, keyed to the code reported to Desktop. */
const authorizationFailures = new Map([
  ["AUTH_REQUIRED", "AUTH_REQUIRED"],
  ["DEVICE_REVOKED", "DEVICE_REVOKED"],
  ["UNAUTHORIZED", "UNAUTHORIZED"],
  ["NOT_FOUND", "UPGRADE_REQUIRED"],
]);
const sameScope = (left: Selection, right: Selection) =>
  left.accountId === right.accountId && left.apiUrl === right.apiUrl;
export { terminalProjectPaths } from "./terminal-control.ts";
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
  private state = initialHostState;
  private readonly authorizationErrors = new Map<string, string>();
  private retry: ReturnType<typeof setTimeout> | undefined;
  private revision = 0;
  private selectionScope = new AbortController();
  private bindingScope = new AbortController();
  private readonly observed = new AcknowledgedStream();
  private queue = Promise.resolve();
  constructor(
    private readonly directory: string,
    private readonly runtime: LocalRuntime,
    private readonly emit: (event: LocalEvent) => void,
    private readonly terminal: LocalTerminalControl,
    vault?: HostVault,
    private readonly independent = true,
  ) {
    this.vault = vault ?? createHostVault(runtime.state.db);
    this.terminal.onCloudChange(() => {
      void this.wake().catch(this.backgroundFailure);
    });
  }
  /** Every lifecycle change goes through the pure `hostState` transition. */
  private apply(event: HostEvent) {
    if (this.closing) return;
    if (event.type === "bound" || event.type === "unbound" || event.type === "closed") {
      this.bindingScope.abort();
      this.observed.reset();
      if (event.type === "bound") this.bindingScope = new AbortController();
    }
    this.state = hostState(this.state, event);
  }
  private get current() {
    return this.state.binding;
  }
  private get persistent() {
    return this.state.persistent;
  }
  private get closing() {
    return this.state.closing;
  }
  private replaceSelection() {
    this.selectionScope.abort();
    this.selectionScope = new AbortController();
  }
  private get observedInitialized() {
    return this.state.observedSynced;
  }
  private scope(value: Scope): Scope {
    return { accountId: value.accountId, apiUrl: serverOrigin(value.apiUrl) };
  }
  /** The account Desktop last selected; absent before any selection, throws when corrupt. */
  private selection(): Selection | undefined {
    const file = join(this.directory, "host-session.json");
    if (!existsSync(file)) return undefined;
    const source = readFileSync(file, "utf8");
    if (source.length > 8192) throw new Error("Invalid selection");
    const selected = localParams["host.session"].parse(JSON.parse(source));
    return { accountId: selected.accountId, apiUrl: serverOrigin(selected.apiUrl) };
  }
  private selectedScope(scope: Scope) {
    try {
      const selected = this.selection();
      if (selected && sameScope(selected, scope)) return scope;
    } catch {
      /* Missing/corrupt selection cannot authorize a different cloud scope. */
    }
    throw new LocalError("AUTH_REQUIRED", "Select this cloud account first");
  }
  private isCurrent(scope: Selection) {
    return this.current !== undefined && sameScope(this.current, scope);
  }
  /** Stops new cloud work for a scope at once; the queued detach completes it. */
  private retire(scope: Scope) {
    if (!this.isCurrent(scope)) return;
    this.replaceSelection();
    this.bindingScope.abort();
    this.terminal.detachCloud();
  }
  private async detachIfCurrent(scope: Scope) {
    if (this.isCurrent(scope)) await this.detachCurrent();
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
    const withAgent = async <T>(
      run: (agents: LocalRuntime["agents"]) => T | Promise<T>,
      signal?: AbortSignal,
    ): Promise<T> => {
      signal?.throwIfAborted();
      await this.runtime.instanceAccess.assert();
      signal?.throwIfAborted();
      return run(this.runtime.agents);
    };
    const control = new RemoteControl({
      directory: this.path(scope),
      engine: {
        observed: (input, signal) => {
          signal?.throwIfAborted();
          return this.request("observed.remote", input);
        },
        projects: (_input, signal) => withAgent((agents) => agents.remoteProjects(), signal),
        capabilities: (_input, signal) =>
          withAgent((agents) => agents.remoteCapabilities(), signal),
        events: ({ binding }, signal) => withAgent((agents) => agents.events(binding), signal),
        replay: ({ binding, after }, signal) =>
          withAgent((agents) => agents.replay(binding, after), signal),
        snapshot: ({ binding, id, offset }, signal) =>
          withAgent((agents) => agents.snapshot(binding, id, offset), signal),
        // Signal guards admission. Agent command receipts/execution outlive the socket.
        remote: ({ binding, command }, signal) =>
          withAgent((agents) => agents.remote(binding, command), signal),
        checkpoint: ({ binding, sequence }, signal) =>
          withAgent((agents) => agents.checkpoint(binding, sequence), signal),
        detach: ({ binding }) => withAgent((agents) => agents.detach(binding)),
      },
      notify: () =>
        this.emit({
          version: 1,
          event: "agent.changed",
          data: { pendingRequest: "remote", notificationOnly: true },
        }),
      grantRequired: () => this.emit({ version: 1, event: "sync.grantRequired", data: {} }),
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
      renewGrant: async (_accountId, _binding, signal) => {
        const current = this.current;
        if (!current || !this.isCurrent(scope))
          throw new LocalError("AUTH_REQUIRED", "Host authorization is unavailable");
        return this.grant(current, AbortSignal.any([signal, this.bindingScope.signal]));
      },
      syncObserved: (send, signal) => this.syncObserved(scope, send, signal),
      observedReset: () => {
        if (!this.isCurrent(scope)) return;
        this.observed.reset();
        this.apply({ type: "observed_reset" });
      },
      observedAck: (epoch, revision, signal) => {
        if (!signal.aborted && this.isCurrent(scope))
          this.observed.acknowledge({ streamId: epoch, sequence: revision });
      },
    });
    this.controls.set(key, control);
    return control;
  }
  private async grant(binding: HostBinding, signal: AbortSignal) {
    const authorization = await abortable(signal, () => this.vault.get(binding));
    if (!authorization || Date.parse(authorization.expiresAt) <= Date.now())
      throw Object.assign(
        new LocalError("AUTH_REQUIRED", "Authorize this daemon again in Desktop"),
        { data: { error: { code: "AUTH_REQUIRED" } } },
      );
    const response = await abortable(signal, () =>
      createApiClient({ baseUrl: binding.apiUrl }).hosts.grant(
        { credential: authorization.credential },
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) },
      ),
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
    const signal = this.selectionScope.signal;
    return this.serial(async () => {
      if (this.closing || signal.aborted) return;
      const file = join(this.directory, "host-binding.json");
      if (!existsSync(file)) return;
      try {
        const source = readFileSync(file, "utf8");
        if (source.length > 8192) return;
        const binding = hostBindingSchema.parse(JSON.parse(source));
        binding.apiUrl = serverOrigin(binding.apiUrl);
        const selected = this.selection();
        if (selected && !sameScope(selected, binding)) return;
        if (
          !this.control(binding).info(binding.accountId).enabled ||
          !(await abortable(signal, () => this.vault.get(binding)))
        )
          return;
        if (this.closing || signal.aborted) return;
        this.apply({ type: "bound", binding, persistent: true });
        this.attachTerminal(binding);
        await this.reconnect(binding);
      } catch {
        /* Remain unavailable without replaying work or changing origins. */
      }
    });
  }
  private async reconnect(binding: HostBinding) {
    const signal = this.bindingScope.signal;
    if (this.closing || signal.aborted || this.current !== binding) return;
    try {
      const grant = await this.grant(binding, signal);
      if (!this.closing && !signal.aborted && this.current === binding)
        await this.control(binding).attach(binding.accountId, binding.apiUrl, grant, signal);
    } catch (error) {
      if (this.closing || signal.aborted || this.current !== binding) return;
      const code = isMissingProcedure(error) ? "NOT_FOUND" : failureCode(error);
      const reported = code === undefined ? undefined : authorizationFailures.get(code);
      if (reported) {
        await this.detachCurrent();
        this.authorizationErrors.set(bindingKey(binding.apiUrl, binding.accountId), reported);
        this.emit({ version: 1, event: "sync.grantRequired", data: {} });
        return;
      }
      if (this.isCurrent(binding) && !this.closing)
        this.retry = setTimeout(() => {
          this.retry = undefined;
          void this.reconnect(binding).catch(this.backgroundFailure);
        }, 15_000);
    }
  }
  info(scope: Scope): ControlInfo {
    const error = this.authorizationErrors.get(bindingKey(scope.apiUrl, scope.accountId));
    return {
      ...this.control(scope).info(scope.accountId),
      daemon: this.independent,
      persistent: this.isCurrent(scope) && this.persistent,
      authorized: this.isCurrent(scope),
      ...(error === undefined ? {} : { error }),
    };
  }
  private async authorize(scope: Scope, raw: HostAuthorization, signal: AbortSignal) {
    signal.throwIfAborted();
    const authorization = hostAuthorizationSchema.parse(raw);
    if (
      authorization.accountId !== scope.accountId ||
      Date.parse(authorization.expiresAt) <= Date.now()
    )
      throw new LocalError("AUTH_REQUIRED", "Invalid host authorization");
    const selected = this.selection();
    if (selected && !sameScope(selected, scope))
      throw new LocalError("AUTH_REQUIRED", "Account selection changed before authorization");
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
    const persistent = await abortable(signal, () => this.vault.set(binding, authorization));
    const grant = await this.grant(binding, signal);
    if (this.closing || signal.aborted)
      throw new LocalError("AUTH_REQUIRED", "Account selection changed");
    const previous = this.current;
    if (previous && remoteBinding(previous) !== remoteBinding(binding)) await this.detachCurrent();
    signal.throwIfAborted();
    this.apply({ type: "bound", binding, persistent });
    this.authorizationErrors.delete(bindingKey(scope.apiUrl, scope.accountId));
    writeJson(join(this.directory, "host-binding.json"), binding);
    const control = this.control(scope);
    await abortable(signal, () => control.enable(scope.accountId, true));
    signal.throwIfAborted();
    this.attachTerminal(binding);
    await control.attach(scope.accountId, scope.apiUrl, grant, this.bindingScope.signal);
    return this.info(scope);
  }
  private async detachCurrent() {
    clearTimeout(this.retry);
    this.retry = undefined;
    const current = this.current;
    if (!current) return;
    const authorization = await this.vault.get(current);
    this.apply({ type: "unbound" });
    this.observed.reset();
    this.terminal.detachCloud();
    await this.control(current).detach();
    if (authorization)
      await createApiClient({ baseUrl: current.apiUrl })
        .hosts.revoke(
          { credential: authorization.credential },
          { signal: AbortSignal.timeout(3000) },
        )
        .catch(() => {});
    // A failed credential deletion must never restore a detached binding at startup.
    rmSync(join(this.directory, "host-binding.json"), { force: true });
    await this.vault.remove(current);
  }
  private async selectAccount(next: Selection) {
    writeJson(join(this.directory, "host-session.json"), next);
    if (this.current && !this.isCurrent(next)) await this.detachCurrent();
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
    connection: AbortSignal,
  ) {
    const signal = AbortSignal.any([connection, this.bindingScope.signal]);
    while (!signal.aborted && this.current && this.isCurrent(scope) && this.terminal.epoch) {
      const binding = remoteBinding(this.current),
        epoch = this.terminal.epoch;
      const initial = !this.observedInitialized;
      const batch = initial ? { sessions: [], requests: [] } : this.terminal.projection(binding);
      if (!initial && !batch.requests.length) return;
      const revision = ++this.revision;
      await this.observed
        .wait({ streamId: epoch, sequence: revision }, signal, () => {
          this.terminal.sent(binding, batch.requests);
          send({ type: "observed", epoch, revision, ...batch });
        })
        .catch((error: unknown) => {
          if (!signal.aborted) throw error;
        });
      if (signal.aborted) return;
      this.apply({ type: "observed_synced" });
      this.terminal.acknowledged(binding, batch.requests);
    }
  }
  private readonly backgroundFailure = backgroundFailure("daemon.background");
  wake() {
    return this.current ? this.control(this.current).wake() : Promise.resolve();
  }
  async projectsChanged() {
    this.terminal.projectsChanged();
    await this.wake();
  }
  private readonly methods: ControlHandlers = {
    "host.session": (input) => {
      const next = { accountId: input.accountId, apiUrl: serverOrigin(input.apiUrl) };
      this.replaceSelection();
      if (this.current && !this.isCurrent(next)) {
        this.bindingScope.abort();
        this.terminal.detachCloud();
      }
      return this.serial(() => this.selectAccount(next));
    },
    "observed.remote": (input) => {
      if (!this.current || input.binding !== remoteBinding(this.current))
        throw new LocalError("REQUEST_CLOSED", "Terminal binding is no longer active");
      return this.terminal.remoteDecision(input.binding, input.decision);
    },
    "host.info": (input) => this.info(this.scope(input)),
    "host.refresh": (input) => {
      const scope = this.scope(input);
      return this.isCurrent(scope) ? this.control(scope).refreshGrant() : false;
    },
    "host.enable": (input) => {
      const scope = this.scope(input);
      if (!input.enabled) this.retire(scope);
      return this.serial(async () => {
        if (!input.enabled) await this.detachIfCurrent(scope);
        return {
          ...(await this.control(scope).enable(scope.accountId, input.enabled)),
          daemon: this.independent,
          persistent: this.isCurrent(scope) && this.persistent,
        };
      });
    },
    "host.revoked": (input) => {
      const scope = this.scope(input);
      this.retire(scope);
      return this.serial(async () => {
        await this.detachIfCurrent(scope);
        return {
          ...this.control(scope).revoked(scope.accountId),
          daemon: this.independent,
          persistent: false,
        };
      });
    },
    "host.authorize": (input) => {
      const signal = this.selectionScope.signal;
      return this.serial(() => this.authorize(this.scope(input), input.authorization, signal));
    },
    "host.detach": (input) => {
      const scope = this.scope(input);
      this.retire(scope);
      return this.serial(async () => {
        await this.detachIfCurrent(scope);
        return true;
      });
    },
    "host.terminal.settings": (input) =>
      this.terminal.cloudSettings(this.selectedScope(this.scope(input))),
    "host.terminal.configure": (input) => {
      const result = this.terminal.configureCloud(this.selectedScope(this.scope(input)), input);
      void this.wake().catch(this.backgroundFailure);
      return result;
    },
  };
  private handles(method: LocalMethod): method is ControlMethod {
    return Object.hasOwn(this.methods, method);
  }
  async request(method: LocalMethod, raw: unknown): Promise<unknown> {
    if (this.closing) throw new LocalError("CLOSING", "Daemon is stopping");
    if (!this.handles(method))
      throw new LocalError("INVALID_METHOD", "Unknown daemon control method");
    // The table type pairs each handler with its own schema; only this lookup erases it.
    const handler = this.methods[method] as (input: unknown) => unknown;
    return handler(localParams[method].parse(raw));
  }
  async close() {
    clearTimeout(this.retry);
    this.retry = undefined;
    this.apply({ type: "closed" });
    this.selectionScope.abort();
    this.terminal.detachCloud();
    await this.queue;
    this.observed.reset();
    for (const control of this.controls.values()) await control.detach();
  }
}
