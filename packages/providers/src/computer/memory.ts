import {
  ComputerError,
  MAX_HOME_BYTES,
  bound,
  commandSchema,
  computerRefSchema,
  validateHome,
  workspacePath,
  type ComputerProvider,
  type ComputerRef,
  type HomeArchive,
  type ProviderComputer,
  type ProcessEvent,
} from "./port.js";
import { MAX_COMPUTER_FILE_BYTES, computerScreenInputSchema } from "@raypx/core/computers";
import { fakeScreen } from "./fake-screen.js";
import { screenFrames } from "./screen-stream.js";

type Entry =
  | { kind: "file"; bytes: string; mode: number }
  | { kind: "directory"; mode: number }
  | { kind: "symlink"; target: string };
interface MemoryComputer {
  view: ProviderComputer;
  files: Map<string, Entry>;
  committed: HomeArchive | undefined;
  cancel: Set<() => void>;
  screenRunning: boolean;
  screenEpoch: number;
  screenRevision: number;
  frameSequence: number;
}
function printfBytes(format: string): Buffer {
  const chunks: Buffer[] = [];
  const pattern = /\\([0-7]{1,3}|n|r|t|\\)/g;
  let offset = 0;
  for (const match of format.matchAll(pattern)) {
    chunks.push(Buffer.from(format.slice(offset, match.index)));
    const value = match[1]!;
    const escapes: Record<string, number> = { n: 10, r: 13, t: 9, "\\": 92 };
    chunks.push(Buffer.from([escapes[value] ?? Number.parseInt(value, 8)]));
    offset = match.index + match[0].length;
  }
  chunks.push(Buffer.from(format.slice(offset)));
  return Buffer.concat(chunks);
}
/** Offline virtual computer: never executes commands on the backend host. */
export function createMemoryComputerProvider(): ComputerProvider {
  const computers = new Map<string, MemoryComputer>();
  function current(ref: ComputerRef, running = false) {
    computerRefSchema.parse(ref);
    const computer = computers.get(ref.id);
    if (!computer) throw new ComputerError("NOT_FOUND");
    if (ref.generation !== computer.view.generation) throw new ComputerError("STALE_GENERATION");
    if (running && computer.view.state !== "running") throw new ComputerError("NOT_RUNNING");
    return computer;
  }
  function pathFor(c: MemoryComputer, path: string) {
    const relative = workspacePath(path);
    const clean = relative ? `workspace/${relative}` : "workspace";
    const parts = clean.split("/");
    while (parts.length) {
      if (c.files.get(parts.join("/"))?.kind === "symlink")
        throw new ComputerError("INVALID_INPUT");
      parts.pop();
    }
    return clean;
  }
  async function archive(c: MemoryComputer) {
    const entries: HomeArchive["entries"] = [];
    for (const [path, entry] of c.files) {
      entries.push({ path, ...entry });
    }
    return (await validateHome({ version: 1, entries })).archive;
  }
  async function snapshot(ref: ComputerRef) {
    const c = current(ref);
    if (c.view.state === "destroyed") throw new ComputerError("NOT_RUNNING");
    const validated = await validateHome(await archive(c));
    if (current(ref).view.state === "destroyed") throw new ComputerError("NOT_RUNNING");
    c.committed = validated.archive;
    c.view.homeRevision = validated.revision;
    return { revision: validated.revision };
  }
  const provider: ComputerProvider = {
    async describe() {
      return {
        execution: "virtual",
        files: true,
        home: true,
        egress: "unrestricted",
        screen: true,
        unenforced: [
          "Virtual commands only: printf, pwd, printenv, sleep, true, false, ln, sh (printf/exit statements only); no OS isolation or network enforcement",
        ],
      };
    },
    async get(ref) {
      return { ...current(ref).view };
    },
    async provision(ref) {
      computerRefSchema.parse(ref);
      let c = computers.get(ref.id);
      if (c && ref.generation < c.view.generation) throw new ComputerError("STALE_GENERATION");
      if (c && ref.generation === c.view.generation && c.view.state === "destroyed")
        throw new ComputerError("NOT_RUNNING");
      if (!c) {
        c = {
          view: { ...ref, state: "stopped", homeRevision: null },
          files: new Map([["workspace", { kind: "directory", mode: 0o755 }]]),
          committed: undefined,
          cancel: new Set(),
          screenRunning: false,
          screenEpoch: 0,
          screenRevision: 0,
          frameSequence: 0,
        };
        computers.set(ref.id, c);
      }
      if (ref.generation > c.view.generation) {
        c.screenRunning = false;
        c.screenEpoch += 1;
        for (const cancel of c.cancel) cancel();
        c.files = new Map(
          c.committed?.entries.map(({ path, ...entry }) => [path, entry]) ?? [
            ["workspace", { kind: "directory", mode: 0o755 }],
          ],
        );
        c.view.generation = ref.generation;
      }
      c.view.state = "running";
      return { ...c.view };
    },
    async stop(ref) {
      const c = current(ref);
      if (c.view.state === "destroyed") return { ...c.view };
      for (const cancel of c.cancel) cancel();
      await snapshot(ref);
      if (current(ref).view.state === "destroyed") return { ...c.view };
      c.view.state = "stopped";
      c.screenRunning = false;
      c.screenEpoch += 1;
      return { ...c.view };
    },
    async destroy(ref) {
      const c = current(ref);
      for (const cancel of c.cancel) cancel();
      c.view.state = "destroyed";
      c.screenRunning = false;
      c.screenEpoch += 1;
      c.files.clear();
      return { ...c.view };
    },
    async execute(ref, input) {
      const c = current(ref, true);
      const command = commandSchema.parse(input);
      const cwd = pathFor(c, command.cwd);
      if (cwd && c.files.get(cwd)?.kind !== "directory") throw new ComputerError("INVALID_INPUT");
      let cancelled = false;
      let wake: (() => void) | undefined;
      const cancel = () => {
        cancelled = true;
        wake?.();
      };
      c.cancel.add(cancel);
      async function* events(): AsyncIterable<ProcessEvent> {
        let status = 0;
        const outputs: { kind: "stdout" | "stderr"; bytes: Buffer }[] = [];
        try {
          if (cancelled) {
            yield { kind: "exit", status: 137, cancelled: true, truncated: false };
            return;
          }
          current(ref, true);
          const name = command.executable.split("/").at(-1);
          if (name === "sleep") {
            const seconds = Number(command.argv[0] ?? "0");
            if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400) status = 1;
            else
              await new Promise<void>((resolve) => {
                const timer = setTimeout(resolve, seconds * 1000);
                wake = () => {
                  clearTimeout(timer);
                  resolve();
                };
                if (cancelled) wake();
              });
          } else if (name === "printf")
            outputs.push({ kind: "stdout", bytes: printfBytes(command.argv[0] ?? "") });
          else if (name === "pwd")
            outputs.push({ kind: "stdout", bytes: Buffer.from(`/home/computer/${cwd}\n`) });
          else if (name === "printenv") {
            const output = command.environment[command.argv[0] ?? ""];
            if (output !== undefined)
              outputs.push({ kind: "stdout", bytes: Buffer.from(`${output}\n`) });
            else status = 1;
          } else if (name === "sh" && command.argv[0] === "-c") {
            for (const statement of (command.argv[1] ?? "").split(";")) {
              const text = statement.trim();
              const exit = /^exit ([0-9]+)$/.exec(text);
              if (exit) {
                status = Number(exit[1]);
                break;
              }
              const print = /^printf (?:'([^']*)'|"([^"]*)"|([^\s]+))(?:\s+(>&2|1>&2))?$/.exec(
                text,
              );
              if (!print) {
                status = 127;
                break;
              }
              outputs.push({
                kind: print[4] ? "stderr" : "stdout",
                bytes: printfBytes(print[1] ?? print[2] ?? print[3] ?? ""),
              });
            }
          } else if (name === "false") status = 1;
          else if (name === "ln" && command.argv[0] === "-s") {
            c.files.set(pathFor(c, command.argv[2] ?? ""), {
              kind: "symlink",
              target: command.argv[1] ?? "",
            });
          } else if (name !== "true" && name !== "sleep") status = 127;
          if (cancelled) {
            yield { kind: "exit", status: 137, cancelled: true, truncated: false };
            return;
          }
          let remaining = command.outputBudget;
          let truncated = false;
          for (const output of outputs) {
            if (output.bytes.length > remaining) truncated = true;
            const part = output.bytes.subarray(0, remaining);
            remaining -= part.length;
            if (part.length) yield { kind: output.kind, bytes: part.toString("base64") };
          }
          yield { kind: "exit", status, cancelled: false, truncated };
        } finally {
          c.cancel.delete(cancel);
        }
      }
      return { events: events(), cancel: async () => cancel() };
    },
    async list(ref, path, limit) {
      const c = current(ref, true);
      const clean = pathFor(c, path);
      bound(limit, 1000);
      if (clean && c.files.get(clean)?.kind !== "directory")
        throw new ComputerError("INVALID_INPUT");
      const prefix = clean ? `${clean}/` : "";
      const entries = [...c.files]
        .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([p, entry]) => ({ path: p.slice(10), kind: entry.kind }));
      return { entries: entries.slice(0, limit), truncated: entries.length > limit };
    },
    async read(ref, path, maxBytes) {
      const c = current(ref, true);
      bound(maxBytes, MAX_HOME_BYTES);
      const entry = c.files.get(pathFor(c, path));
      if (entry?.kind !== "file") throw new ComputerError("NOT_FOUND");
      if (Buffer.from(entry.bytes, "base64").length > maxBytes)
        throw new ComputerError("LIMIT_EXCEEDED");
      return { bytes: entry.bytes };
    },
    async readFile(ref, path, maxBytes) {
      const c = current(ref, true);
      bound(maxBytes, MAX_COMPUTER_FILE_BYTES);
      const entry = c.files.get(pathFor(c, path));
      if (entry?.kind !== "file") throw new ComputerError("NOT_FOUND");
      const bytes = Buffer.from(entry.bytes, "base64");
      return {
        bytes: bytes.subarray(0, maxBytes).toString("base64"),
        size: bytes.length,
        truncated: bytes.length > maxBytes,
      };
    },
    async write(ref, path, bytes) {
      const c = current(ref, true);
      const clean = pathFor(c, path);
      if (!clean || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(bytes))
        throw new ComputerError("INVALID_INPUT");
      if (Buffer.from(bytes, "base64").length > MAX_HOME_BYTES)
        throw new ComputerError("LIMIT_EXCEEDED");
      const parts = clean.split("/");
      parts.pop();
      let parent = "";
      for (const part of parts) {
        parent = parent ? `${parent}/${part}` : part;
        const existing = c.files.get(parent);
        if (existing && existing.kind !== "directory") throw new ComputerError("INVALID_INPUT");
        c.files.set(parent, { kind: "directory", mode: 0o755 });
      }
      if (c.files.get(clean)?.kind === "directory") throw new ComputerError("INVALID_INPUT");
      c.files.set(clean, { kind: "file", bytes, mode: 0o644 });
    },
    async exportHome(ref) {
      const c = current(ref);
      if (c.view.state !== "running" && c.committed) return structuredClone(c.committed);
      return archive(c);
    },
    async importHome(ref, input) {
      const c = current(ref);
      if (c.view.state === "destroyed") throw new ComputerError("NOT_RUNNING");
      const validated = await validateHome(input);
      if (current(ref).view.state === "destroyed") throw new ComputerError("NOT_RUNNING");
      c.screenRunning = false;
      c.screenEpoch += 1;
      for (const cancel of c.cancel) cancel();
      c.files = new Map(validated.archive.entries.map(({ path, ...entry }) => [path, entry]));
      c.committed = validated.archive;
      c.view.homeRevision = validated.revision;
      return { revision: validated.revision };
    },
    snapshot,
    async screen(ref) {
      const c = current(ref, true);
      return { available: true, running: c.screenRunning, width: 1024, height: 768 };
    },
    async startScreen(ref) {
      const c = current(ref, true);
      c.screenRunning = true;
      return { available: true, running: true, width: 1024, height: 768 };
    },
    async stopScreen(ref) {
      const c = current(ref, true);
      c.screenRunning = false;
      c.screenEpoch += 1;
      return { available: true, running: false, width: 1024, height: 768 };
    },
    async screenshot(ref) {
      const c = current(ref, true);
      if (!c.screenRunning) throw new ComputerError("NOT_RUNNING");
      return fakeScreen(++c.frameSequence, c.screenRevision);
    },
    async input(ref, input) {
      const c = current(ref, true);
      if (!c.screenRunning) throw new ComputerError("NOT_RUNNING");
      const value = computerScreenInputSchema.parse(input);
      if (value.kind === "pointer" && (value.x >= 1024 || value.y >= 768))
        throw new ComputerError("INVALID_INPUT");
      c.screenRevision += 1;
    },
    streamScreen(ref, options) {
      const c = current(ref, true);
      const epoch = c.screenEpoch;
      return screenFrames(async () => {
        if (current(ref, true).screenEpoch !== epoch) return null;
        return provider.screenshot!(ref);
      }, options?.signal);
    },
  };
  return provider;
}
