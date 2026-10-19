import { localParams, type LocalEvent, type LocalMethod } from "@raypx/contracts/local";
import { FileRuntime } from "./files";
import { JobRuntime } from "./jobs";
import { ProcessRuntime } from "./process";
import { StateStore, profilePath } from "./state";
import { LocalError } from "./errors";
import manifest from "../../package.json";
import type { RecordDiagnostic } from "../diagnostics";

export function createRuntime(
  options: {
    dataDir?: string;
    profile?: string;
    emit?: (event: LocalEvent) => void;
    scheduler?: boolean;
    recordDiagnostic?: RecordDiagnostic;
  } = {},
) {
  const emit = options.emit ?? (() => {});
  const state = new StateStore(profilePath(options));
  const files = new FileRuntime(state);
  const processes = new ProcessRuntime(emit);
  const jobs = new JobRuntime(state, files, processes, emit, options.recordDiagnostic);
  let closing = false;
  let closingPromise: Promise<void> | undefined;
  const pending = new Set<Promise<unknown>>();
  try {
    if (options.scheduler) jobs.startScheduler();
  } catch (error) {
    state.close();
    throw error;
  }
  return {
    state,
    files,
    jobs,
    processes,
    request(method: LocalMethod, raw: unknown): Promise<unknown> {
      if (closing)
        return Promise.reject(new LocalError("CLOSING", "Local engine is shutting down"));
      const operation = (async () => {
        // Narrow each schema independently to preserve method-specific types.
        switch (method) {
          case "runtime.info":
            return {
              version: manifest.version,
              protocolVersion: 1,
              profile: options.profile ?? "default",
              scheduler: Boolean(options.scheduler),
              runtime: Bun.version,
            };
          case "roots.list":
            return state.roots();
          case "roots.register":
            return files.register(localParams[method].parse(raw).path);
          case "roots.remove":
            state.removeRoot(localParams[method].parse(raw).id);
            return { removed: true };
          case "files.list": {
            const p = localParams[method].parse(raw);
            return files.list(p.rootId, p.path, p.offset, p.limit);
          }
          case "files.stat": {
            const p = localParams[method].parse(raw);
            return files.stat(p.rootId, p.path);
          }
          case "files.read": {
            const p = localParams[method].parse(raw);
            return files.read(p.rootId, p.path);
          }
          case "files.write": {
            const p = localParams[method].parse(raw);
            return files.write(p.rootId, p.path, p.text, p.version);
          }
          case "files.mkdir": {
            const p = localParams[method].parse(raw);
            return files.mkdir(p.rootId, p.path);
          }
          case "files.move": {
            const p = localParams[method].parse(raw);
            return files.move(p.rootId, p.path, p.to, p.version);
          }
          case "files.delete": {
            const p = localParams[method].parse(raw);
            return files.delete(p.rootId, p.path, p.version);
          }
          case "jobs.list":
            return jobs.list();
          case "jobs.create":
            return jobs.create(localParams[method].parse(raw));
          case "jobs.update": {
            const { id, ...input } = localParams[method].parse(raw);
            return jobs.update(id, input);
          }
          case "jobs.delete":
            return jobs.delete(localParams[method].parse(raw).id);
          case "jobs.run":
            return jobs.run(localParams[method].parse(raw).id);
          case "jobs.history":
            return state
              .history(localParams[method].parse(raw).id)
              .map((run) => ({ ...run, output: run.output.slice(0, 8_192) }));
          case "tools.run": {
            const p = localParams[method].parse(raw);
            return processes.run(p, undefined, p.id);
          }
          case "tools.cancel":
            return processes.cancel(localParams[method].parse(raw).id);
          case "terminal.open": {
            const p = localParams[method].parse(raw);
            return processes.terminal(p, p.cols, p.rows);
          }
          case "terminal.input": {
            const p = localParams[method].parse(raw);
            return processes.input(p.id, p.data);
          }
          case "terminal.resize": {
            const p = localParams[method].parse(raw);
            return processes.resize(p.id, p.cols, p.rows);
          }
          case "terminal.close":
            return processes.cancel(localParams[method].parse(raw).id);
        }
      })();
      pending.add(operation);
      void operation.then(
        () => pending.delete(operation),
        () => pending.delete(operation),
      );
      return operation;
    },
    close() {
      if (closingPromise) return closingPromise;
      closing = true;
      closingPromise = (async () => {
        // Stop producers and cancel execution first. File requests already
        // accepted must finish their state lookups before SQLite is closed.
        await Promise.allSettled([jobs.close(), processes.close()]);
        await Promise.allSettled(pending);
        state.close();
      })();
      return closingPromise;
    },
  };
}
export type LocalRuntime = ReturnType<typeof createRuntime>;
