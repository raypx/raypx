import {
  mcpCredentialHeadersSchema,
  type McpServer,
  type McpServerConfiguration,
  type McpCredentialHeaders,
  type McpTestCode,
} from "@raypx/core/mcp-servers";
import { mcpToolNameSchema, type McpToolName } from "@raypx/core/approvals";
import type { SpaceMembership } from "./port.js";

export interface McpServersPort {
  list(this: void, input: Record<string, never>): Promise<McpServer[]>;
  create(
    this: void,
    input: { server: McpServerConfiguration; credentialHeaders?: McpCredentialHeaders },
  ): Promise<McpServer>;
  update(
    this: void,
    input: { id: string; server: McpServerConfiguration; credentialHeaders?: McpCredentialHeaders },
  ): Promise<McpServer>;
  delete(this: void, input: { id: string }): Promise<{ deleted: true }>;
  test(this: void, input: { id: string }): Promise<McpTestResult>;
  setAvailability(
    this: void,
    input: { id: string; availability: McpServer["availability"] },
  ): Promise<McpServer>;
}
export interface McpTestResult {
  code: McpTestCode;
  toolNames: string[];
}
export interface DiscoveredMcpTool {
  name: McpToolName;
  serverName: string;
  remoteName: string;
}
export function discoveredMcpTools(
  server: Pick<McpServer, "id" | "name">,
  result: McpTestResult,
): DiscoveredMcpTool[] {
  if (result.code !== "SUCCEEDED") return [];
  return result.toolNames.flatMap((remoteName) => {
    const parsed = mcpToolNameSchema.safeParse(
      `mcp_${server.id.replaceAll("-", "")}__${remoteName}`,
    );
    return parsed.success ? [{ name: parsed.data, serverName: server.name, remoteName }] : [];
  });
}
export interface McpServerDraft {
  name: string;
  url: string;
  availability: McpServer["availability"];
}
export function createMcpServerDraft(server: McpServer | null): McpServerDraft {
  return {
    name: server?.name ?? "",
    url: server?.url ?? "",
    availability: server?.availability ?? { mode: "all" },
  };
}
/** Deliberately separate from observable drafts. Submission consumes secrets on every outcome. */
export class McpHeaderSecret {
  private value = "";
  set(value: string) {
    this.value = value;
  }
  clear() {
    this.value = "";
  }
  take(): McpCredentialHeaders | undefined {
    const text = this.value;
    this.clear();
    if (!text.trim()) return undefined;
    const entries = text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => {
        const separator = line.indexOf(":");
        if (separator < 1) throw new Error("INVALID_HEADERS");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      });
    return mcpCredentialHeadersSchema.parse(Object.fromEntries(entries));
  }
}
export interface McpServersView {
  servers: readonly McpServer[];
  spaces: readonly SpaceMembership[];
  loading: boolean;
  busy: string | null;
  error: "load" | "save" | "delete" | "MCP_STDIO_UNSUPPORTED" | null;
  results: Readonly<Record<string, McpTestResult>>;
}
export class McpServersController {
  private view: McpServersView = {
    servers: [],
    spaces: [],
    loading: true,
    busy: null,
    error: null,
    results: {},
  };
  private readonly listeners = new Set<() => void>();
  private disposed = false;
  constructor(
    private readonly port: McpServersPort,
    private readonly spaces: { list(input: Record<string, never>): Promise<SpaceMembership[]> },
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  private update(patch: Partial<McpServersView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  async load() {
    this.update({ loading: true, error: null });
    try {
      const [servers, spaces] = await Promise.all([this.port.list({}), this.spaces.list({})]);
      this.update({ servers, spaces });
    } catch {
      this.update({ error: "load" });
    } finally {
      this.update({ loading: false });
    }
  }
  async save(
    id: string | null,
    server: McpServerConfiguration,
    credentialHeaders?: McpCredentialHeaders,
  ) {
    if (this.disposed || this.view.busy) return false;
    this.update({ busy: id ?? "new", error: null });
    try {
      const input = { server, ...(credentialHeaders ? { credentialHeaders } : {}) };
      const saved = id ? await this.port.update({ ...input, id }) : await this.port.create(input);
      const results = { ...this.view.results };
      delete results[saved.id];
      this.update({
        servers: [...this.view.servers.filter((entry) => entry.id !== saved.id), saved],
        results,
      });
      return !this.disposed;
    } catch (error) {
      const refused = error instanceof Error && error.message === "MCP_STDIO_UNSUPPORTED";
      this.update({ error: refused ? "MCP_STDIO_UNSUPPORTED" : "save" });
      return false;
    } finally {
      this.update({ busy: null });
    }
  }
  async test(id: string) {
    if (this.disposed || this.view.busy) return;
    this.update({ busy: id });
    try {
      const result = await this.port.test({ id });
      this.update({ results: { ...this.view.results, [id]: result } });
    } catch {
      this.update({
        results: { ...this.view.results, [id]: { code: "REQUEST_FAILED", toolNames: [] } },
      });
    } finally {
      this.update({ busy: null });
    }
  }
  async remove(id: string) {
    if (this.disposed || this.view.busy) return;
    this.update({ busy: id, error: null });
    try {
      await this.port.delete({ id });
      this.update({ servers: this.view.servers.filter((server) => server.id !== id) });
    } catch {
      this.update({ error: "delete" });
    } finally {
      this.update({ busy: null });
    }
  }
  dispose() {
    this.disposed = true;
    this.listeners.clear();
  }
}
