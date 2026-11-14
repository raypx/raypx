import {
  createMemoryComputerProvider,
  ComputerError,
  type ComputerProcess,
  type ComputerProvider,
  type ComputerRef,
  type HomeArchive,
  type ComputerCommand,
} from "@raypx/providers/computer";
import type { EngineFetch } from "../src/engine.js";
import type { ComputerStore, StoredComputer } from "../src/store.js";
import type { ComputerScreenInput } from "@raypx/core/computers";

export function memoryStore(): ComputerStore {
  const rows = new Map<string, StoredComputer>();
  const homes = new Map<string, HomeArchive>();
  return {
    async read(id) {
      return structuredClone(rows.get(id));
    },
    async write(computer) {
      rows.set(computer.id, structuredClone(computer));
    },
    async home(id, revision) {
      const archive = homes.get(`${id}:${revision}`);
      if (!archive) throw new Error("Missing fixture home");
      return structuredClone(archive);
    },
    async saveHome(id, revision, archive) {
      homes.set(`${id}:${revision}`, structuredClone(archive));
    },
  };
}
function frame(bytes: string, channel = 1) {
  const payload = Buffer.from(bytes, "base64");
  const header = Buffer.alloc(8);
  header[0] = channel;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}
interface Container {
  provider: ComputerProvider;
  ref: ComputerRef;
  running: boolean;
}
interface Exec {
  container: Container;
  operation: string;
  input: Record<string, unknown>;
  status: number;
}
export function fakeEngine() {
  const calls: { path: string; method: string; body: unknown }[] = [];
  const containers = new Map<string, Container>();
  const inputs = new Map<string, Record<string, unknown>>();
  const execs = new Map<string, Exec>();
  const processes = new Map<string, ComputerProcess>();
  const networks: { Name: string; Id: string }[] = [];
  let restoreFailure = false;
  const request: EngineFetch = async (raw, init) => {
    const path = raw.replace("/v1.47", "");
    const method = init.method ?? "GET";
    if (path.includes("/archive?")) {
      // A real Engine refuses uploads into a read-only root or a tmpfs; only a volume path works.
      if (!path.endsWith("/archive?path=/run/raypx"))
        return Response.json({ message: "container rootfs is marked read-only" }, { status: 400 });
      const tar = Buffer.from(init.body as Uint8Array);
      const name = tar.subarray(0, 100).toString().replace(/\0.*$/, "");
      const size = Number.parseInt(tar.subarray(124, 136).toString().replace(/\0.*$/, ""), 8);
      inputs.set(`/run/raypx/${name}`, JSON.parse(tar.subarray(512, 512 + size).toString()));
      return new Response(null);
    }
    const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
    calls.push({ path, method, body });
    if (path === "/networks") return Response.json(networks);
    if (path === "/networks/create") {
      networks.push({ Name: String(body.Name), Id: "network" });
      return Response.json({ Id: "network" });
    }
    if (path === "/volumes/create") return Response.json({ Name: body.Name });
    if (path.startsWith("/volumes/") && method === "DELETE") return new Response(null);
    if (path === "/containers/create") {
      const id = crypto.randomUUID();
      const provider = createMemoryComputerProvider();
      const ref = { id, generation: 1 };
      await provider.provision(ref);
      containers.set(id, { provider, ref, running: false });
      return Response.json({ Id: id });
    }
    const match = /^\/containers\/([^/?]+)(.*)$/.exec(path);
    if (match) {
      const c = containers.get(match[1]!);
      if (!c) return Response.json({}, { status: 404 });
      const suffix = match[2];
      if (suffix === "/json") return Response.json({ State: { Running: c.running } });
      if (suffix === "/start") {
        c.running = true;
        await c.provider.provision(c.ref);
        return new Response(null);
      }
      if (suffix?.startsWith("/stop")) {
        c.running = false;
        await c.provider.stop(c.ref);
        return new Response(null);
      }
      if (suffix?.startsWith("?force")) {
        await c.provider.destroy(c.ref);
        containers.delete(match[1]!);
        return new Response(null);
      }
      if (suffix === "/exec") {
        const argv = body.Cmd as string[];
        const helper = argv.indexOf("/opt/raypx/home.py");
        const id = crypto.randomUUID();
        execs.set(id, {
          container: c,
          operation: argv[helper + 1]!,
          input: inputs.get(argv[helper + 2]!)!,
          status: 0,
        });
        return Response.json({ Id: id });
      }
    }
    const execution = /^\/exec\/([^/]+)\/(start|json)$/.exec(path);
    if (execution) {
      const e = execs.get(execution[1]!)!;
      if (execution[2] === "json") return Response.json({ ExitCode: e.status });
      const { provider, ref } = e.container;
      if (e.operation === "exec") {
        const { executionId: _, ...command } = e.input;
        const process = await provider.execute(ref, {
          ...command,
          outputBudget: 1024 * 1024,
        } as unknown as ComputerCommand);
        processes.set(String(e.input.executionId), process);
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              void (async () => {
                for await (const event of process.events) {
                  if (event.kind === "exit") e.status = event.status;
                  else controller.enqueue(frame(event.bytes, event.kind === "stderr" ? 2 : 1));
                }
                processes.delete(String(e.input.executionId));
                controller.close();
              })().catch((error: unknown) => controller.error(error));
            },
          }),
        );
      }
      let value: unknown;
      try {
        const { path: selected, limit, maxBytes, bytes, archive, executionId } = e.input;
        switch (e.operation) {
          case "screen-get":
            value = await provider.screen!(ref);
            break;
          case "screen-start":
            value = await provider.startScreen!(ref);
            break;
          case "screen-stop":
            value = await provider.stopScreen!(ref);
            break;
          case "screen-screenshot": {
            const { sequence: _, ...image } = await provider.screenshot!(ref);
            value = image;
            break;
          }
          case "screen-input":
            await provider.input!(ref, e.input.input as ComputerScreenInput);
            value = {};
            break;
          case "cancel":
            await processes.get(String(executionId))?.cancel();
            value = {};
            break;
          case "export":
            value = await provider.exportHome(ref);
            break;
          case "import":
            if (restoreFailure) throw new ComputerError("RESTORE_FAILED");
            await provider.importHome(ref, archive as HomeArchive);
            value = {};
            break;
          case "write":
            await provider.write(ref, String(selected), String(bytes));
            value = {};
            break;
          case "read":
            value = await provider.read(ref, String(selected), Number(maxBytes));
            break;
          case "list":
            value = await provider.list(ref, String(selected), Number(limit));
            break;
          default:
            throw new Error("Unexpected fake helper operation");
        }
      } catch (error) {
        e.status = 1;
        value = { code: error instanceof ComputerError ? error.code : "PROVIDER_UNAVAILABLE" };
      }
      return new Response(frame(Buffer.from(JSON.stringify(value)).toString("base64")));
    }
    throw new Error(`Unexpected fake Engine operation: ${method} ${path}`);
  };
  return {
    request,
    calls,
    failRestore() {
      restoreFailure = true;
    },
  };
}
