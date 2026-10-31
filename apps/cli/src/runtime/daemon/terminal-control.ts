import { realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { hostname } from "node:os";
import {
  LOCAL_WORKSPACE_ID,
  localParams,
  type LocalEvent,
  type LocalMethod,
} from "@raypx/contracts/local";
import type {
  ObservedProjection,
  TerminalDecision,
  TerminalRequest,
  TerminalSession,
} from "@raypx/contracts/terminal";
import type { LocalRuntime } from "../index";
import { LocalError } from "../errors";
import { startTerminalHost } from "../terminal/host";
import { connectorAction, connectorStatus } from "./connectors";
import { bindingKey } from "./vault";
import {
  cloudTerminalSchema,
  emptyCloud,
  readTerminalConfiguration,
  terminalSettingsSchema,
  writeTerminalConfiguration,
  type TerminalConfiguration,
} from "./terminal-settings";

const APPROVAL_LEASE_MS = 15_000;
export type CloudTerminalChannel = {
  binding: string;
  accountId: string;
  apiUrl: string;
  connected(): boolean;
  supported?(): boolean;
};
type Exposure = {
  binding: string;
  scope: string;
  rootId: string;
  active: boolean;
  sentRevision: number;
  sentPending: boolean;
};
export function terminalProjectPaths(roots: { id: string; path: string }[]) {
  const paths = new Map<string, string>();
  for (const root of roots) {
    try {
      if (realpathSync(root.path) === root.path && statSync(root.path).isDirectory())
        paths.set(root.path, root.id);
    } catch {
      /* An unavailable grant cannot authorize a replacement path. */
    }
  }
  return paths;
}

/** A profile owns one broker; cloud connections are removable delivery channels. */
export class LocalTerminalControl {
  private settings: TerminalConfiguration;
  private terminal: ReturnType<typeof startTerminalHost> | undefined;
  private unavailable = false;
  private readonly viewers = new Map<string, number>();
  private readonly exposures = new Map<string, Exposure>();
  private readonly dirty = new Map<string, Map<string, TerminalRequest>>();
  private cloud: CloudTerminalChannel | undefined;
  private cloudUntil = 0;
  private wake = () => {};
  constructor(
    private readonly profile: string,
    private readonly runtime: LocalRuntime,
    private readonly emit: (event: LocalEvent) => void,
    private readonly clock = Date.now,
  ) {
    try {
      this.settings = readTerminalConfiguration(profile);
    } catch {
      this.settings = {
        version: 1,
        local: { rootIds: [], away: false, waitSeconds: 300 },
        clouds: {},
      };
      this.unavailable = true;
    }
    try {
      this.terminal = startTerminalHost({
        directory: join(profile, "terminal"),
        discoveryDirectory: profile,
        lockDirectory: profile,
        ...this.configuration(),
        ignoreSession: (provider, id) => this.runtime.agents.managesSession(provider, id),
        reachable: (request, session) => this.reachable(request, session),
        admitted: (request, session) => {
          const channel = this.eligibleCloud(session);
          if (channel)
            this.exposures.set(request.id, {
              binding: channel.binding,
              scope: bindingKey(channel.apiUrl, channel.accountId),
              rootId: session.projectId,
              active: true,
              sentRevision: 0,
              sentPending: false,
            });
        },
        setAway: (away) => this.configure({ ...this.settings.local, away }),
        changed: (request) => this.changed(request),
      });
    } catch {
      this.unavailable = true;
    }
  }
  get supported() {
    return Boolean(this.terminal) && !this.unavailable;
  }
  get epoch() {
    return this.terminal?.broker.epoch;
  }
  onCloudChange(wake: () => void) {
    this.wake = wake;
  }
  attachCloud(channel: CloudTerminalChannel) {
    if (this.cloud?.binding === channel.binding) {
      this.cloud = channel;
      return;
    }
    this.detachCloud();
    this.cloud = channel;
  }
  connected(binding: string) {
    if (this.cloud?.binding === binding) this.cloudUntil = this.clock() + APPROVAL_LEASE_MS;
  }
  detachCloud() {
    const old = this.cloud;
    this.cloud = undefined;
    this.cloudUntil = 0;
    if (old) {
      for (const [id, exposure] of this.exposures)
        if (exposure.binding === old.binding) this.withdraw(id, exposure);
      this.dirty.delete(old.binding);
    }
    this.sweep();
  }
  private cloudReachable() {
    if (!this.cloud) return false;
    if (this.cloud.supported?.() === false) {
      this.cloudUntil = 0;
      return false;
    }
    if (this.cloud.connected()) this.cloudUntil = this.clock() + APPROVAL_LEASE_MS;
    return this.cloudUntil > this.clock();
  }
  private localReachable() {
    for (const [id, until] of this.viewers) if (until <= this.clock()) this.viewers.delete(id);
    return this.viewers.size > 0;
  }
  private eligibleCloud(session: TerminalSession) {
    const cloud = this.cloud;
    if (!cloud || cloud.supported?.() === false) return;
    const settings = this.cloudSettings(cloud);
    return settings.enabled && settings.rootIds.includes(session.projectId) ? cloud : undefined;
  }
  private reachable(request?: TerminalRequest, session?: TerminalSession) {
    const remote = request ? this.exposures.get(request.id) : undefined;
    const eligible = request
      ? remote?.active && remote.binding === this.cloud?.binding
      : session && this.eligibleCloud(session);
    const cloud = this.cloudReachable();
    return this.localReachable() || Boolean(eligible && cloud);
  }
  releaseClient(clientId: string) {
    this.viewers.delete(clientId);
    this.sweep();
  }
  private sweep() {
    for (const request of this.terminal?.broker.pendingRequests() ?? [])
      if (!this.reachable(request)) this.terminal!.broker.cancel(request.id, "unavailable");
  }
  private configuration() {
    const settings = this.settings.local;
    const paths = terminalProjectPaths(
      this.runtime.state.roots().filter((root) => settings.rootIds.includes(root.id)),
    );
    return {
      projects: [...paths.keys()],
      projectIds: paths,
      away: settings.away,
      waitSeconds: settings.waitSeconds,
      authorizeProject: (path: string, provider: import("@raypx/core/tasks").AgentProvider) => {
        const id = paths.get(path);
        return Boolean(
          id &&
          this.runtime.agents.projectProviders(id).includes(provider) &&
          terminalProjectPaths(this.runtime.state.roots()).get(path) === id,
        );
      },
    };
  }
  private save(next: TerminalConfiguration) {
    if (this.unavailable)
      throw new LocalError("SETTINGS_UNAVAILABLE", "Terminal settings require recovery");
    writeTerminalConfiguration(join(this.profile, "terminal"), next);
    this.settings = next;
  }
  configure(raw: unknown) {
    const local = terminalSettingsSchema.parse(raw);
    local.rootIds = [...new Set(local.rootIds)];
    for (const id of local.rootIds) {
      this.runtime.state.root(id);
      if (!this.runtime.agents.projectProviders(id).length)
        throw new LocalError("PROJECT_NOT_AUTHORIZED", "Enable this Agent project first");
    }
    const clouds = Object.fromEntries(
      Object.entries(this.settings.clouds).map(([key, value]) => [
        key,
        { ...value, rootIds: value.rootIds.filter((id) => local.rootIds.includes(id)) },
      ]),
    );
    this.save({ ...this.settings, local, clouds });
    this.reconcileExposures();
    this.terminal?.configure(this.configuration());
    return local;
  }
  projectsChanged() {
    if (this.unavailable) return;
    const roots = new Set(
      this.runtime.state
        .roots()
        .filter((root) => this.runtime.agents.projectProviders(root.id).length)
        .map((root) => root.id),
    );
    this.configure({
      ...this.settings.local,
      rootIds: this.settings.local.rootIds.filter((id) => roots.has(id)),
    });
  }
  cloudSettings(scope: { apiUrl: string; accountId: string }) {
    return this.settings.clouds[bindingKey(scope.apiUrl, scope.accountId)] ?? emptyCloud();
  }
  configureCloud(scope: { apiUrl: string; accountId: string }, raw: unknown) {
    const value = cloudTerminalSchema.parse(raw);
    value.rootIds = [...new Set(value.rootIds)];
    if (value.rootIds.some((id) => !this.settings.local.rootIds.includes(id)))
      throw new LocalError(
        "PROJECT_NOT_AUTHORIZED",
        "Cloud projects must be a subset of local projects",
      );
    this.save({
      ...this.settings,
      clouds: { ...this.settings.clouds, [bindingKey(scope.apiUrl, scope.accountId)]: value },
    });
    this.reconcileExposures();
    return value;
  }
  private reconcileExposures() {
    for (const [id, exposure] of this.exposures) {
      const settings = this.settings.clouds[exposure.scope];
      if (!settings?.enabled || !settings.rootIds.includes(exposure.rootId))
        this.withdraw(id, exposure);
    }
    this.wake();
  }
  private withdraw(id: string, exposure: Exposure) {
    if (!exposure.active) return;
    exposure.active = false;
    const queue = this.dirty.get(exposure.binding);
    queue?.delete(id);
    const request = this.terminal?.broker.get(id);
    if (request && exposure.sentPending) {
      this.enqueue(exposure.binding, {
        ...request,
        revision: Math.max(request.revision, exposure.sentRevision) + 1,
        status: "cancelled",
        body: "",
        questions: [],
        decision: null,
      });
    }
  }
  private enqueue(binding: string, request: TerminalRequest) {
    let queue = this.dirty.get(binding);
    if (!queue) {
      queue = new Map();
      this.dirty.set(binding, queue);
    }
    queue.set(request.id, request);
  }
  private changed(request: TerminalRequest) {
    const exposure = this.exposures.get(request.id);
    if (exposure?.active) {
      this.enqueue(exposure.binding, request);
      this.wake();
    }
    // Admission can evict history; private delivery metadata has the same bound.
    const retained = new Set(
      this.terminal?.broker.list(256).map((item) => item.id) ?? [request.id],
    );
    for (const id of this.exposures.keys()) if (!retained.has(id)) this.exposures.delete(id);
    for (const queue of this.dirty.values())
      for (const id of queue.keys()) if (!retained.has(id)) queue.delete(id);
    this.emit({
      version: 1,
      event: "observed.changed",
      data: {
        local: true,
        ...(request.status === "pending" ? { pendingRequest: request.id } : {}),
      },
    });
  }
  projection(binding: string) {
    const requests = [...(this.dirty.get(binding)?.values() ?? [])].slice(0, 5);
    const ids = new Set(requests.map((request) => request.sessionId));
    const sessions = this.terminal?.sessions().filter((session) => ids.has(session.id)) ?? [];
    return { requests, sessions };
  }
  sent(binding: string, requests: TerminalRequest[]) {
    for (const request of requests) {
      const exposure = this.exposures.get(request.id);
      if (exposure?.binding === binding) {
        exposure.sentRevision = Math.max(exposure.sentRevision, request.revision);
        exposure.sentPending = request.status === "pending";
      }
    }
  }
  acknowledged(binding: string, requests: TerminalRequest[]) {
    const queue = this.dirty.get(binding);
    for (const request of requests)
      if (queue?.get(request.id) === request) queue.delete(request.id);
  }
  remoteDecision(binding: string, decision: TerminalDecision) {
    const exposure = this.exposures.get(decision.id);
    if (
      !this.cloud ||
      this.cloud.supported?.() === false ||
      this.cloud.binding !== binding ||
      !exposure?.active ||
      exposure.binding !== binding
    )
      throw new LocalError("REQUEST_CLOSED", "Terminal remote authorization is unavailable");
    return this.decide(decision);
  }
  private decide(decision: TerminalDecision) {
    if (!this.terminal)
      throw new LocalError("UNSUPPORTED_PLATFORM", "Local terminal approvals are unavailable");
    const request = this.terminal.broker.get(decision.id);
    const session = this.terminal.sessions().find((item) => item.id === request?.sessionId);
    if (
      request?.status === "pending" &&
      (!session ||
        !this.settings.local.rootIds.includes(session.projectId) ||
        !this.configuration().authorizeProject(
          this.runtime.state.root(session.projectId).path,
          request.provider,
        ))
    ) {
      this.terminal.broker.cancel(request.id, "unavailable");
      throw new LocalError("REQUEST_CLOSED", "Project authorization changed");
    }
    return this.terminal.broker.decide(decision);
  }
  async request(method: LocalMethod, raw: unknown, clientId?: string): Promise<unknown> {
    if (method === "connectors.status")
      return connectorStatus(this.profile, localParams[method].parse(raw).configDirs);
    if (method === "connectors.install" || method === "connectors.uninstall") {
      const input = localParams[method].parse(raw);
      return connectorAction(
        this.profile,
        input.provider,
        method === "connectors.install" ? "install" : "uninstall",
        input.configDirs,
        "recoverModified" in input && input.recoverModified === true,
      );
    }
    if (!this.supported)
      throw new LocalError("UNSUPPORTED_PLATFORM", "Local terminal approvals are unavailable");
    if (method === "approvals.local.watch") {
      const { active } = localParams[method].parse(raw);
      if (!clientId) throw new LocalError("INVALID_CLIENT", "A connected client is required");
      if (active) this.viewers.set(clientId, this.clock() + APPROVAL_LEASE_MS);
      else this.releaseClient(clientId);
      return true;
    }
    if (method === "approvals.local.settings") {
      localParams[method].parse(raw);
      return this.settings.local;
    }
    if (method === "approvals.local.configure") return this.configure(raw);
    if (method === "approvals.local.decide")
      return this.decide(localParams[method].parse(raw).decision);
    if (method === "approvals.local.get") {
      const value = this.terminal!.broker.get(localParams[method].parse(raw).id);
      if (!value) throw new LocalError("NOT_FOUND", "Terminal request unavailable");
      return value;
    }
    if (method === "approvals.local.list") {
      localParams[method].parse(raw);
      const device = await this.runtime.agents.localDevice(LOCAL_WORKSPACE_ID);
      const requests = [
        ...this.terminal!.broker.pendingRequests(),
        ...this.terminal!.broker.list(256)
          .filter((item) => item.status !== "pending")
          .reverse(),
      ].slice(0, 100);
      const ids = new Set(requests.map((request) => request.sessionId));
      return {
        sessions: this.terminal!.sessions()
          .filter((session) => ids.has(session.id))
          .map((session) => ({ ...session, deviceId: device.id, deviceName: hostname() })),
        requests: requests.map(
          ({ body: _body, questions: _questions, decision: _decision, ...request }) => ({
            ...request,
            deviceId: device.id,
          }),
        ),
      } satisfies ObservedProjection;
    }
    throw new LocalError("INVALID_METHOD", "Unknown local terminal method");
  }
  async close() {
    this.viewers.clear();
    await this.terminal?.close();
  }
}
