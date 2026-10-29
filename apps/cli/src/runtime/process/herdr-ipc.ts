import { connect } from "node:net";
import { LocalError } from "../errors";

export const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export const herdrError = () => new LocalError("TERMINAL_HOST_PROTOCOL", "Invalid Herdr response");

/** Herdr's public local JSON API; each mutation is sent exactly once. */
export function herdrRequest(
  path: string,
  method: string,
  params: unknown = {},
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const socket = connect(process.platform === "win32" ? `\\\\.\\pipe\\${path}` : path);
    socket.setEncoding("utf8");
    let buffer = "";
    let finished = false;
    const deadline = setTimeout(() => socket.destroy(new Error("deadline")), 5000);
    const finish = (error?: Error, result?: Record<string, unknown>) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      socket.removeAllListeners();
      socket.destroy();
      if (error) reject(error);
      else resolve(result!);
    };
    socket.once("error", () =>
      finish(new LocalError("TERMINAL_HOST_UNAVAILABLE", "Herdr request failed")),
    );
    socket.once("connect", () =>
      socket.write(JSON.stringify({ id: "raypx", method, params }) + "\n"),
    );
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 8 * 1024 * 1024) return finish(herdrError());
      const end = buffer.indexOf("\n");
      if (end < 0) return;
      try {
        const value: unknown = JSON.parse(buffer.slice(0, end));
        if (!record(value) || value.id !== "raypx" || !record(value.result))
          return finish(herdrError());
        finish(undefined, value.result);
      } catch {
        finish(herdrError());
      }
    });
    socket.once("end", () => finish(herdrError()));
  });
}
