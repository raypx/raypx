import { connect, type Socket } from "node:net";

/** Private NDJSON driver. Only native-smoke builds listen on this endpoint. */
export async function connectSmoke(endpoint: string, token: string) {
  if (token.length < 32) throw new Error("Smoke driver requires a random token");
  const deadline = Date.now() + 30_000;
  let socket: Socket | undefined;
  while (!socket) {
    try {
      socket = await new Promise<Socket>((resolve, reject) => {
        const connection = connect(endpoint);
        connection.once("connect", () => {
          connection.off("error", reject);
          resolve(connection);
        });
        connection.once("error", reject);
      });
    } catch {
      if (Date.now() >= deadline) throw new Error("Native smoke socket did not become ready");
      await Bun.sleep(100);
    }
  }
  const connection = socket;
  const pending = new Map<
    string,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  let buffer = "";
  const fail = () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("Native smoke socket closed"));
    }
    pending.clear();
  };
  connection.setEncoding("utf8");
  connection.on("error", fail);
  connection.on("close", fail);
  connection.on("data", (data: string) => {
    buffer += data;
    if (Buffer.byteLength(buffer) > 8 * 1024 * 1024) {
      connection.destroy();
      return;
    }
    let boundary: number;
    while ((boundary = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 1);
      let response: { id: string; ok: boolean; value?: unknown; error?: string };
      try {
        response = JSON.parse(line);
      } catch {
        connection.destroy();
        return;
      }
      const request = pending.get(response.id);
      if (!request) continue;
      pending.delete(response.id);
      clearTimeout(request.timer);
      if (response.ok) request.resolve(response.value);
      else request.reject(new Error(response.error ?? "Native smoke operation failed"));
    }
  });
  return {
    request<T = unknown>(method: string, input: unknown = {}): Promise<T> {
      const id = crypto.randomUUID();
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Native smoke ${method} timed out`));
        }, 30_000);
        pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
        connection.write(JSON.stringify({ token, id, method, input }) + "\n");
      });
    },
    close() {
      connection.destroy();
    },
  };
}
