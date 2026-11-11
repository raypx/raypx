import type { DesktopExecution } from "@raypx/contracts/desktop";
import { localParams, type LocalEvent, type ToolResult } from "@raypx/contracts/local";
import type { ExecutionHost } from "../../owner.js";
import { LocalError } from "../../errors.js";

export interface ExecutionScope {
  owner: string;
  origin: string;
  identity: string;
}
type Execution = DesktopExecution & {
  scope: ExecutionScope;
  abort: AbortController;
  result?: ToolResult;
  bytes: number;
};
function sameScope(left: ExecutionScope, right: ExecutionScope) {
  return (
    left.owner === right.owner && left.origin === right.origin && left.identity === right.identity
  );
}

/** Accepted Desktop work belongs to a native owner, never to a WebSocket. */
export class DesktopExecutions {
  private readonly executions = new Map<string, Execution>();
  constructor(private readonly host: ExecutionHost) {}
  async scope(owner: string, origin: string): Promise<ExecutionScope> {
    await this.host.runtime.instanceAccess.assert();
    const { binding } = await this.host.runtime.instanceAccess.status();
    if (binding && binding.origin !== origin)
      throw new LocalError("INSTANCE_OWNER_MISMATCH", "Instance belongs to another origin");
    return {
      owner,
      origin,
      identity: binding ? JSON.stringify([binding.instanceId, binding.accountId]) : "registered",
    };
  }
  list(scope: ExecutionScope): DesktopExecution[] {
    return [...this.executions.values()]
      .filter((entry) => sameScope(entry.scope, scope))
      .map(({ id, kind, status, cwd }) => ({ id, kind, status, cwd }));
  }
  private owned(scope: ExecutionScope, id: string) {
    const entry = this.executions.get(id);
    if (!entry || !sameScope(entry.scope, scope))
      throw new LocalError("EXECUTION_NOT_FOUND", "Execution unavailable");
    return entry;
  }
  result(scope: ExecutionScope, id: string) {
    const entry = this.owned(scope, id);
    if (!entry.result)
      throw new LocalError("EXECUTION_RESULT_UNAVAILABLE", "Execution result unavailable");
    return entry.result;
  }
  async restore(scope: ExecutionScope, id: string) {
    const entry = this.owned(scope, id);
    if (entry.kind !== "terminal" || entry.status !== "running")
      throw new LocalError("TERMINAL_NOT_FOUND", "Terminal unavailable");
    await this.host.runtime.processes.restore(id);
    return { accepted: true as const };
  }
  control(scope: ExecutionScope, id: string) {
    this.owned(scope, id);
  }
  async start(
    scope: ExecutionScope,
    method: "tools.run" | "terminal.open",
    raw: unknown,
    admission: AbortSignal,
    cancellation: AbortSignal,
  ) {
    const input = localParams[method].parse(raw);
    admission.throwIfAborted();
    const id = "id" in input && typeof input.id === "string" ? input.id : crypto.randomUUID();
    if (this.executions.has(id))
      throw new LocalError("DUPLICATE_ID", "Execution identity already exists");
    const entry: Execution = {
      id,
      kind: method === "tools.run" ? "tool" : "terminal",
      status: "running",
      cwd: input.cwd,
      scope,
      abort: new AbortController(),
      bytes: 0,
    };
    this.executions.set(id, entry);
    const signal = AbortSignal.any([entry.abort.signal, cancellation]);
    try {
      if (method === "tools.run") {
        const command = localParams["tools.run"].parse(input);
        return await this.host.runtime.processes.run(command, signal, id);
      }
      const terminal = localParams["terminal.open"].parse(input);
      const result = await this.host.runtime.processes.terminal(
        terminal,
        terminal.cols,
        terminal.rows,
        id,
        signal,
      );
      if (signal.aborted) this.host.runtime.processes.cancel(id);
      return result;
    } catch (error) {
      this.executions.delete(id);
      throw error;
    }
  }
  event(event: LocalEvent, encodedBytes: number) {
    if (!["terminal.output", "terminal.exit", "tool.finished"].includes(event.event)) return;
    const entry =
      typeof event.data.id === "string" ? this.executions.get(event.data.id) : undefined;
    if (!entry) return;
    if (event.event !== "terminal.output") {
      entry.status = "finished";
      if (event.event === "tool.finished") entry.result = event.data as unknown as ToolResult;
      entry.bytes = encodedBytes;
      this.executions.delete(entry.id);
      this.executions.set(entry.id, entry);
      const completed = [...this.executions.values()].filter((item) => item.status === "finished");
      let bytes = completed.reduce((total, item) => total + item.bytes, 0);
      while (completed.length > 64 || bytes > 8 * 1024 * 1024) {
        const oldest = completed.shift()!;
        bytes -= oldest.bytes;
        this.executions.delete(oldest.id);
      }
    }
    return entry.scope;
  }
  release(owner?: string) {
    for (const [id, entry] of this.executions) {
      if (owner !== undefined && entry.scope.owner !== owner) continue;
      entry.abort.abort();
      this.host.runtime.processes.cancel(id);
      this.executions.delete(id);
    }
  }
}
