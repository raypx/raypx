import { ComputerError, type ProcessEvent } from "@raypx/providers/computer";
export type EngineFetch = (path: string, init: RequestInit) => Promise<Response>;
export class Engine {
  constructor(private readonly request: EngineFetch) {}
  async response(path: string, method = "GET", body?: unknown, accepted: number[] = []) {
    const response = await this.request(`/v1.47${path}`, {
      method,
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    });
    const alreadyInState =
      response.status === 304 &&
      method === "POST" &&
      /^\/containers\/[^/]+\/(?:start|stop)(?:\?|$)/.test(path);
    if (!response.ok && !alreadyInState && !accepted.includes(response.status))
      throw new ComputerError("PROVIDER_UNAVAILABLE");
    return response;
  }
  async json<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    return (await (await this.response(path, method, body)).json()) as T;
  }
  async exec(
    container: string,
    argv: string[],
    environment: string[] = [],
    cwd = "/home/computer/workspace",
  ) {
    const { Id } = await this.json<{ Id: string }>(`/containers/${container}/exec`, "POST", {
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      User: "1000:1000",
      Cmd: argv,
      Env: environment,
      WorkingDir: cwd,
    });
    const response = await this.response(`/exec/${Id}/start`, "POST", {
      Detach: false,
      Tty: false,
    });
    return { id: Id, body: response.body! };
  }
  async *output(
    body: ReadableStream<Uint8Array>,
  ): AsyncIterable<Extract<ProcessEvent, { bytes: string }>> {
    const reader = body.getReader();
    let pending = Buffer.alloc(0);
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        pending = Buffer.concat([pending, value]);
        while (pending.length >= 8) {
          const size = pending.readUInt32BE(4);
          if (size > 16 * 1024 * 1024 || ![1, 2].includes(pending[0]!))
            throw new ComputerError("PROVIDER_UNAVAILABLE");
          if (pending.length < size + 8) break;
          yield {
            kind: pending[0] === 1 ? "stdout" : "stderr",
            bytes: pending.subarray(8, 8 + size).toString("base64"),
          };
          pending = pending.subarray(8 + size);
        }
      }
      if (pending.length) throw new ComputerError("PROVIDER_UNAVAILABLE");
    } finally {
      await reader.cancel();
    }
  }
  async startHelper(container: string, operation: string, input: object = {}) {
    const name = `rpx-input-${crypto.randomUUID()}.json`;
    const data = Buffer.from(JSON.stringify(input));
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, "utf8");
    function octal(value: number, offset: number, length: number) {
      header.write(value.toString(8).padStart(length - 1, "0") + "\0", offset, length, "ascii");
    }
    octal(0o600, 100, 8);
    octal(1000, 108, 8);
    octal(1000, 116, 8);
    octal(data.length, 124, 12);
    octal(0, 136, 12);
    header.fill(32, 148, 156);
    header[156] = 48;
    header.write("ustar\0", 257);
    header.write("00", 263);
    octal(
      header.reduce((total, byte) => total + byte, 0),
      148,
      8,
    );
    const tar = Buffer.concat([
      header,
      data,
      Buffer.alloc(((512 - (data.length % 512)) % 512) + 1024),
    ]);
    const response = await this.request(`/v1.47/containers/${container}/archive?path=/tmp`, {
      method: "PUT",
      headers: { "content-type": "application/x-tar" },
      body: tar,
    });
    if (!response.ok) throw new ComputerError("PROVIDER_UNAVAILABLE");
    return this.exec(container, ["python3", "/opt/raypx/home.py", operation, `/tmp/${name}`]);
  }
  async helper<T>(
    container: string,
    operation: string,
    input: object = {},
    maxBytes = 64 * 1024 * 1024,
  ): Promise<T> {
    const exec = await this.startHelper(container, operation, input);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const event of this.output(exec.body)) {
      const bytes = Buffer.from(event.bytes, "base64");
      size += bytes.length;
      if (size > maxBytes) throw new ComputerError("LIMIT_EXCEEDED");
      if (event.kind === "stdout") chunks.push(bytes);
    }
    const result = await this.json<{ ExitCode: number }>(`/exec/${exec.id}/json`);
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as T & {
      code?: ComputerError["code"];
    };
    if (result.ExitCode !== 0) throw new ComputerError(value.code ?? "PROVIDER_UNAVAILABLE");
    return value;
  }
}
export function socketEngine(socket: string) {
  return new Engine((path, init) =>
    fetch(`http://localhost${path}`, {
      ...init,
      unix: socket,
      signal: AbortSignal.timeout(120_000),
    }),
  );
}
