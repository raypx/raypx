import { homedir } from "node:os";
import { z } from "zod";
import { browserFrameSchema, type BrowserView } from "@raypx/core/browser";

export type BrowserFrame = NonNullable<Extract<BrowserView, { state: "open" }>["frame"]>;
const results = z.array(z.object({ success: z.boolean(), result: z.unknown() }));
const streamMessage = z.object({
  type: z.literal("frame"),
  data: z.string(),
  metadata: z.object({ deviceWidth: z.number(), deviceHeight: z.number() }),
});

export function browserDriver(executable: string, domains: readonly string[], chrome?: string) {
  async function command(
    session: string,
    commands: string[][],
    signal = AbortSignal.timeout(18_000),
  ) {
    signal.throwIfAborted();
    const proc = Bun.spawn(
      [
        executable,
        "--session",
        session,
        "--allowed-domains",
        domains.join(","),
        "--idle-timeout",
        "10m",
        ...(chrome ? ["--executable-path", chrome] : []),
        "batch",
        "--json",
        "--bail",
      ],
      {
        stdin: new TextEncoder().encode(JSON.stringify(commands)),
        stdout: "pipe",
        stderr: "ignore",
        signal,
        // The isolated broker's credentials never reach Chromium or the daemon.
        env: { HOME: homedir(), PATH: process.env.PATH },
      },
    );
    const [raw, status] = await Promise.all([proc.stdout.text(), proc.exited]);
    const parsed = results.safeParse(JSON.parse(raw));
    if (status !== 0 || !parsed.success || parsed.data.some((result) => !result.success))
      throw new Error("BROWSER_COMMAND_FAILED");
    return parsed.data.map((result) => result.result);
  }
  return {
    command,
    async frames(
      session: string,
      receive: (frame: BrowserFrame | null) => void,
      signal: AbortSignal,
    ) {
      const [view] = await command(session, [["stream", "status"]], signal);
      const { port } = z.object({ port: z.number().int().min(1).max(65_535) }).parse(view);
      const socket = new WebSocket(`ws://127.0.0.1:${port}`, {
        headers: { origin: "http://127.0.0.1" },
      });
      socket.addEventListener("open", () =>
        socket.send(JSON.stringify({ type: "config", maxFps: 4 })),
      );
      socket.addEventListener("message", ({ data }) => {
        if (typeof data !== "string" || data.length > 1_100_000) return;
        try {
          const event = streamMessage.safeParse(JSON.parse(data));
          if (!event.success) return;
          const frame = browserFrameSchema.safeParse({
            width: event.data.metadata.deviceWidth,
            height: event.data.metadata.deviceHeight,
            jpeg: event.data.data,
          });
          if (frame.success) receive(frame.data);
        } catch {
          // A malformed provider frame never enters the public projection.
        }
      });
      socket.addEventListener("close", () => receive(null));
      return () => socket.close();
    },
  };
}
