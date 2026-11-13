import {
  modelConnectionConfigurationSchema,
  type ModelConnection,
  type ModelConnectionConfiguration,
  type ModelConnectionTestCode,
} from "@raypx/core/model-connections";
import type { SpaceMembership, OfferedModel } from "./port.js";

export interface ModelConnectionsPort {
  list(this: void, input: Record<string, never>): Promise<ModelConnection[]>;
  create(
    this: void,
    input: { connection: ModelConnectionConfiguration; secret: string },
  ): Promise<ModelConnection>;
  update(
    this: void,
    input: { id: string; connection: ModelConnectionConfiguration; secret?: string },
  ): Promise<ModelConnection>;
  delete(this: void, input: { id: string }): Promise<{ deleted: true }>;
  test(this: void, input: { id: string }): Promise<{ code: ModelConnectionTestCode }>;
}
export interface ModelConnectionDraft {
  name: string;
  kind: ModelConnection["kind"];
  models: string;
  baseUrl: string;
  api: NonNullable<ModelConnection["api"]>;
  availability: ModelConnection["availability"];
}
export function createConnectionDraft(connection: ModelConnection | null): ModelConnectionDraft {
  return {
    name: connection?.name ?? "",
    kind: connection?.kind ?? "anthropic",
    models: connection?.models.join("\n") ?? "",
    baseUrl: connection?.baseUrl ?? "",
    api: connection?.api ?? "openai-completions",
    availability: connection?.availability ?? { mode: "all" },
  };
}
export function connectionConfiguration(
  draft: ModelConnectionDraft,
): ModelConnectionConfiguration | null {
  const result = modelConnectionConfigurationSchema.safeParse({
    name: draft.name,
    kind: draft.kind,
    models: draft.models
      .split(/[\n,]/)
      .map((model) => model.trim())
      .filter(Boolean),
    baseUrl: draft.kind === "compatible" ? draft.baseUrl.trim() : null,
    api: draft.kind === "compatible" ? draft.api : null,
    availability: draft.availability,
  });
  return result.success ? result.data : null;
}
/** Kept outside observable form state; submitting consumes the value even on failure. */
export class ConnectionSecret {
  private value = "";
  set(value: string) {
    this.value = value;
  }
  take() {
    const value = this.value;
    this.clear();
    return value;
  }
  clear() {
    this.value = "";
  }
}
export function modelChoiceGroups(models: readonly OfferedModel[]) {
  return {
    connection: models.filter((model) => model.source === "connection"),
    deployment: models.filter((model) => model.source === "deployment"),
  };
}
interface ModelConnectionsView {
  connections: readonly ModelConnection[];
  spaces: readonly SpaceMembership[];
  loading: boolean;
  busy: string | null;
  error: "load" | "save" | "delete" | null;
  testResults: Readonly<Record<string, ModelConnectionTestCode>>;
}
export class ModelConnectionsController {
  private view: ModelConnectionsView = {
    connections: [],
    spaces: [],
    loading: true,
    busy: null,
    error: null,
    testResults: {},
  };
  private readonly listeners = new Set<() => void>();
  private disposed = false;
  constructor(
    private readonly port: ModelConnectionsPort,
    private readonly spaces: { list(input: Record<string, never>): Promise<SpaceMembership[]> },
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  private update(patch: Partial<ModelConnectionsView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  async load() {
    this.update({ loading: true, error: null });
    try {
      const [connections, spaces] = await Promise.all([this.port.list({}), this.spaces.list({})]);
      this.update({ connections, spaces });
    } catch {
      this.update({ error: "load" });
    } finally {
      this.update({ loading: false });
    }
  }
  async save(id: string | null, connection: ModelConnectionConfiguration, secret: string) {
    if (this.disposed || this.view.busy) return false;
    this.update({ busy: id ?? "new", error: null });
    try {
      let saved: ModelConnection;
      if (id) saved = await this.port.update({ id, connection, ...(secret ? { secret } : {}) });
      else saved = await this.port.create({ connection, secret });
      const testResults = { ...this.view.testResults };
      delete testResults[saved.id];
      this.update({
        connections: [...this.view.connections.filter((entry) => entry.id !== saved.id), saved],
        testResults,
      });
      return !this.disposed;
    } catch {
      this.update({ error: "save" });
      return false;
    } finally {
      this.update({ busy: null });
    }
  }
  async remove(id: string) {
    if (this.disposed || this.view.busy) return;
    this.update({ busy: id, error: null });
    try {
      await this.port.delete({ id });
      this.update({ connections: this.view.connections.filter((entry) => entry.id !== id) });
    } catch {
      this.update({ error: "delete" });
    } finally {
      this.update({ busy: null });
    }
  }
  async test(id: string) {
    if (this.disposed || this.view.busy) return;
    this.update({ busy: id, error: null });
    let code: ModelConnectionTestCode = "REQUEST_FAILED";
    try {
      code = (await this.port.test({ id })).code;
    } catch {
      /* Only the public outcome code enters view state. */
    }
    this.update({ testResults: { ...this.view.testResults, [id]: code }, busy: null });
  }
  dispose() {
    this.disposed = true;
    this.listeners.clear();
  }
}
