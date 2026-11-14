import type { AgentId } from "@raypx/core/agents";
import type { SpaceId } from "@raypx/core/spaces";
import type {
  OpenApiServer,
  OpenApiServerConfiguration,
  OpenApiCredential,
  OpenApiTestCode,
} from "@raypx/core/openapi-servers";
import type { AgentConversationView, SpaceMembership } from "./port.js";

export interface OpenApiTestResult {
  code: OpenApiTestCode;
  operationIds: string[];
}
export interface OpenApiServersPort {
  list(this: void, input: { spaceId: SpaceId }): Promise<OpenApiServer[]>;
  create(
    this: void,
    input: {
      spaceId: SpaceId;
      server: OpenApiServerConfiguration;
      source: { document: string } | { url: string };
      credential?: OpenApiCredential;
    },
  ): Promise<OpenApiServer>;
  update(
    this: void,
    input: {
      spaceId: SpaceId;
      id: string;
      server: OpenApiServerConfiguration;
      credential?: OpenApiCredential;
    },
  ): Promise<OpenApiServer>;
  delete(this: void, input: { spaceId: SpaceId; id: string }): Promise<{ deleted: true }>;
  test(this: void, input: { spaceId: SpaceId; id: string }): Promise<OpenApiTestResult>;
}
export interface OpenApiDirectoryPort {
  spaces: { list(this: void, input: Record<string, never>): Promise<SpaceMembership[]> };
  agents: {
    list(this: void, input: { spaceId: SpaceId; limit?: number }): Promise<AgentConversationView[]>;
  };
}
export function createOpenApiServerDraft(server: OpenApiServer | null): OpenApiServerConfiguration {
  return {
    name: server?.name ?? "",
    url: server?.url ?? "",
    selectedOperationIds: [...(server?.selectedOperationIds ?? [])],
    availability: server?.availability ?? { mode: "all" },
  };
}
/** Credential bytes never enter observable drafts or snapshots. Each submission consumes them. */
export class OpenApiSecret {
  private value = "";
  set(value: string) {
    this.value = value;
  }
  clear() {
    this.value = "";
  }
  take(type: "keep" | "none" | "bearer" | "apiKey", header: string): OpenApiCredential | undefined {
    const value = this.value;
    this.clear();
    if (type === "keep") return undefined;
    if (type === "none") return { type };
    if (!value || value.length > 8192 || /[\r\n\0]/u.test(value))
      throw new Error("INVALID_CREDENTIAL");
    if (type === "bearer") return { type, value };
    if (!/^[!#$%&'*+.^_`|~\w-]+$/u.test(header)) throw new Error("INVALID_CREDENTIAL");
    return { type, header, value };
  }
}
export interface OpenApiServersView {
  spaces: readonly SpaceMembership[];
  spaceId: SpaceId | null;
  servers: readonly OpenApiServer[];
  agents: readonly { id: AgentId; name: string }[];
  loading: boolean;
  busy: string | null;
  error: "load" | "save" | "delete" | null;
  results: Readonly<Record<string, OpenApiTestResult>>;
}
export class OpenApiServersController {
  private view: OpenApiServersView = {
    spaces: [],
    spaceId: null,
    servers: [],
    agents: [],
    loading: true,
    busy: null,
    error: null,
    results: {},
  };
  private generation = 0;
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  constructor(
    private readonly port: OpenApiServersPort,
    private readonly directory: OpenApiDirectoryPort,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  private update(patch: Partial<OpenApiServersView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  async load() {
    if (this.disposed) return;
    const generation = ++this.generation;
    this.update({ loading: true, error: null });
    try {
      const spaces = (await this.directory.spaces.list({})).filter(
        (entry) => entry.member.role === "owner",
      );
      if (this.disposed || generation !== this.generation) return;
      this.update({ spaces });
      const selected = spaces.find((entry) => entry.space.id === this.view.spaceId) ?? spaces[0];
      if (selected) await this.selectSpace(selected.space.id);
      else this.update({ spaceId: null, servers: [], agents: [], loading: false });
    } catch {
      if (generation === this.generation) this.update({ error: "load", loading: false });
    }
  }
  async selectSpace(spaceId: SpaceId) {
    if (
      this.disposed ||
      this.view.busy ||
      !this.view.spaces.some((entry) => entry.space.id === spaceId)
    )
      return;
    const generation = ++this.generation;
    this.update({ spaceId, servers: [], agents: [], results: {}, loading: true, error: null });
    try {
      const [servers, agents] = await Promise.all([
        this.port.list({ spaceId }),
        this.directory.agents.list({ spaceId, limit: 100 }),
      ]);
      if (generation !== this.generation || this.disposed) return;
      this.update({
        servers,
        agents: agents.map(({ agent }) => ({ id: agent.id, name: agent.name })),
      });
    } catch {
      if (generation === this.generation) this.update({ error: "load" });
    } finally {
      if (generation === this.generation) this.update({ loading: false });
    }
  }
  async save(
    id: string | null,
    server: OpenApiServerConfiguration,
    source?: { document: string } | { url: string },
    credential?: OpenApiCredential,
  ): Promise<OpenApiServer | null> {
    const spaceId = this.view.spaceId;
    if (this.disposed || this.view.busy || !spaceId) return null;
    this.update({ busy: id ?? "new", error: null });
    try {
      const input = { spaceId, server, ...(credential ? { credential } : {}) };
      let saved: OpenApiServer;
      if (id) saved = await this.port.update({ ...input, id });
      else {
        if (!source) throw new Error("SOURCE_REQUIRED");
        saved = await this.port.create({ ...input, source });
      }
      const results = { ...this.view.results };
      delete results[saved.id];
      this.update({
        servers: [...this.view.servers.filter((entry) => entry.id !== saved.id), saved],
        results,
      });
      return this.disposed ? null : saved;
    } catch {
      this.update({ error: "save" });
      return null;
    } finally {
      this.update({ busy: null });
    }
  }
  async test(id: string) {
    const spaceId = this.view.spaceId;
    if (this.disposed || this.view.busy || !spaceId) return;
    this.update({ busy: id });
    try {
      const result = await this.port.test({ spaceId, id });
      this.update({ results: { ...this.view.results, [id]: result } });
    } catch {
      this.update({
        results: { ...this.view.results, [id]: { code: "REQUEST_FAILED", operationIds: [] } },
      });
    } finally {
      this.update({ busy: null });
    }
  }
  async remove(id: string) {
    const spaceId = this.view.spaceId;
    if (this.disposed || this.view.busy || !spaceId) return;
    this.update({ busy: id, error: null });
    try {
      await this.port.delete({ spaceId, id });
      this.update({ servers: this.view.servers.filter((entry) => entry.id !== id) });
    } catch {
      this.update({ error: "delete" });
    } finally {
      this.update({ busy: null });
    }
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.listeners.clear();
  }
}
