import {
  loadAgentCapabilities,
  saveAgentCapabilities,
  McpServersController,
  OpenApiServersController,
  type AgentCapabilitiesPort,
  type AgentCapabilitySelection,
  type McpServersPort,
  type OpenApiServersPort,
  type OpenApiDirectoryPort,
} from "@raypx/agents/model";
import { SkillsController, type SkillsPort } from "@raypx/skills/model";
import type { PagesClientPort } from "@raypx/pages/model";
import type { Page } from "@raypx/core/pages";
import type { SpaceId } from "@raypx/core/spaces";
import type { AgentId } from "@raypx/core/agents";
import type { SkillAvailability } from "@raypx/core/skills";

/** Native documents always leave the authenticated app frame for the Web workspace. */
export function pagesWebDestination(origin: string, spaceId: SpaceId, page?: Page) {
  const url = new URL("/pages", origin);
  url.searchParams.set("spaceId", spaceId);
  if (page && page.spaceId === spaceId) url.searchParams.set("pageId", page.id);
  return url.href;
}

export class MobilePagesController {
  private view = {
    pages: [] as readonly Page[],
    loading: true,
    error: false,
    opening: null as string | null,
  };
  private listeners = new Set<() => void>();
  private generation = 0;
  private disposed = false;
  constructor(
    private readonly port: Pick<PagesClientPort, "list">,
    readonly spaceId: SpaceId,
    private readonly origin: string,
    private readonly openWeb: (url: string) => Promise<unknown>,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  private update(patch: Partial<typeof this.view>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  async load() {
    if (this.disposed) return;
    const generation = ++this.generation;
    this.update({ loading: true, error: false });
    try {
      const pages = await this.port.list({ spaceId: this.spaceId, limit: 100 });
      if (generation === this.generation) this.update({ pages });
    } catch {
      if (generation === this.generation) this.update({ error: true });
    } finally {
      if (generation === this.generation) this.update({ loading: false });
    }
  }
  async open(page?: Page) {
    if (this.disposed || this.view.opening || (page && page.spaceId !== this.spaceId)) return;
    this.update({ opening: page?.id ?? "list", error: false });
    try {
      await this.openWeb(pagesWebDestination(this.origin, this.spaceId, page));
    } catch {
      this.update({ error: true });
    } finally {
      this.update({ opening: null });
    }
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.listeners.clear();
  }
}

interface ResourcePorts {
  skills: SkillsPort;
  mcpServers: McpServersPort;
  openApiServers: OpenApiServersPort;
  directory: OpenApiDirectoryPort;
  capabilities: AgentCapabilitiesPort;
}

/** Composes feature models; this client never edits definitions or stores credentials. */
export class MobileResourcesController {
  readonly skills: SkillsController;
  readonly servers: McpServersController;
  readonly apis: OpenApiServersController;
  private view = {
    loading: true,
    busy: false,
    error: false,
    selection: { skillIds: [], serverIds: [] } as AgentCapabilitySelection,
  };
  private listeners = new Set<() => void>();
  private generation = 0;
  private disposed = false;
  private unsubscribe: (() => void)[];
  constructor(
    private readonly port: ResourcePorts,
    readonly spaceId: SpaceId,
    readonly agentId: AgentId | undefined,
    readonly canReadApis: boolean,
  ) {
    this.skills = new SkillsController(port.skills, spaceId);
    this.servers = new McpServersController(port.mcpServers, port.directory.spaces);
    this.apis = new OpenApiServersController(port.openApiServers, {
      agents: port.directory.agents,
      spaces: {
        list: async () =>
          (await port.directory.spaces.list({})).filter(({ space }) => space.id === spaceId),
      },
    });
    this.unsubscribe = [this.skills, this.servers, this.apis].map((controller) =>
      controller.subscribe(() => this.update({})),
    );
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  private update(patch: Partial<typeof this.view>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  async load() {
    if (this.disposed || this.view.busy) return;
    const generation = ++this.generation;
    this.update({ loading: true, error: false });
    try {
      const [, , , capabilities] = await Promise.all([
        this.skills.load(),
        this.servers.load(),
        this.canReadApis ? this.apis.load() : Promise.resolve(),
        this.agentId
          ? loadAgentCapabilities(this.port.capabilities, this.spaceId, this.agentId)
          : Promise.resolve(null),
      ]);
      if (generation !== this.generation) return;
      this.update({
        selection: capabilities?.selection ?? { skillIds: [], serverIds: [] },
        error: Boolean(
          this.skills.getSnapshot().error ||
          this.servers.getSnapshot().error ||
          (this.canReadApis && this.apis.getSnapshot().error),
        ),
      });
    } catch {
      if (generation === this.generation) this.update({ error: true });
    } finally {
      if (generation === this.generation) this.update({ loading: false });
    }
  }
  async toggle(kind: "skill" | "server", id: string, enabled: boolean) {
    if (this.disposed || this.view.loading || this.view.busy || !this.agentId) return;
    const skill = this.skills.getSnapshot().skills.find((entry) => entry.id === id);
    const server = this.servers.getSnapshot().servers.find((entry) => entry.id === id);
    const resource = kind === "skill" ? skill : server;
    if (
      !resource ||
      (resource.availability.mode === "selected" &&
        !resource.availability.spaceIds.includes(this.spaceId))
    )
      return;
    const key = kind === "skill" ? "skillIds" : "serverIds";
    const ids = this.view.selection[key].filter((value) => value !== id);
    if (enabled) ids.push(id);
    const selection = { ...this.view.selection, [key]: ids };
    this.update({ busy: true, error: false });
    try {
      await saveAgentCapabilities(this.port.capabilities, this.spaceId, this.agentId, selection);
      if (this.disposed) return;
      const refreshed = await loadAgentCapabilities(
        this.port.capabilities,
        this.spaceId,
        this.agentId,
      );
      this.update({ selection: refreshed.selection });
    } catch {
      if (this.disposed) return;
      // Parallel feature writes can settle independently. Re-read before presenting a selection.
      try {
        const refreshed = await loadAgentCapabilities(
          this.port.capabilities,
          this.spaceId,
          this.agentId,
        );
        this.update({ selection: refreshed.selection });
      } catch {
        /* The failure remains visible and an explicit reload retries. */
      }
      this.update({ error: true });
    } finally {
      this.update({ busy: false });
    }
  }
  async setAllSpaces(kind: "skill" | "server", id: string, enabled: boolean) {
    await this.saveAvailability(
      kind,
      id,
      enabled ? { mode: "all" } : { mode: "selected", spaceIds: [this.spaceId] },
    );
  }
  async setCurrentSpace(kind: "skill" | "server", id: string, enabled: boolean) {
    const resource =
      kind === "skill"
        ? this.skills.getSnapshot().skills.find((entry) => entry.id === id)
        : this.servers.getSnapshot().servers.find((entry) => entry.id === id);
    if (!resource || resource.availability.mode !== "selected") return;
    const spaceIds = resource.availability.spaceIds.filter((value) => value !== this.spaceId);
    if (enabled) spaceIds.push(this.spaceId);
    await this.saveAvailability(kind, id, { mode: "selected", spaceIds });
  }
  private async saveAvailability(
    kind: "skill" | "server",
    id: string,
    availability: SkillAvailability,
  ) {
    if (this.disposed || this.view.loading || this.view.busy) return;
    const skill = this.skills.getSnapshot().skills.find((entry) => entry.id === id);
    const server = this.servers.getSnapshot().servers.find((entry) => entry.id === id);
    if (
      (kind === "skill" && (!skill || skill.ownership !== "account")) ||
      (kind === "server" && !server)
    )
      return;
    this.update({ busy: true, error: false });
    try {
      if (kind === "skill")
        await this.port.skills.setAvailability({ spaceId: this.spaceId, id, availability });
      else await this.port.mcpServers.setAvailability({ id, availability });
      if (this.disposed) return;
      await Promise.all([this.skills.load(), this.servers.load()]);
      if (this.agentId) {
        const refreshed = await loadAgentCapabilities(
          this.port.capabilities,
          this.spaceId,
          this.agentId,
        );
        this.update({ selection: refreshed.selection });
      }
      this.update({
        error: Boolean(this.skills.getSnapshot().error || this.servers.getSnapshot().error),
      });
    } catch {
      this.update({ error: true });
    } finally {
      this.update({ busy: false });
    }
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    for (const unsubscribe of this.unsubscribe) unsubscribe();
    this.skills.dispose();
    this.servers.dispose();
    this.apis.dispose();
    this.listeners.clear();
  }
}
