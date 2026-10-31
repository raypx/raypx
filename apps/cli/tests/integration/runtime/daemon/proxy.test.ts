import { expect, it } from "vite-plus/test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { daemonEventLines } from "../../../../src/transport/daemon-stdio";
import { profilePath } from "../../../../src/runtime/state";
import manifest from "../../../../package.json";

it("reassembles UTF-8 events across arbitrary byte boundaries and rejects truncated records", async () => {
  const input = JSON.stringify({ text: "hello😀" }) + "\n";
  const bytes = new TextEncoder().encode(input);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const lines = [];
  for await (const line of daemonEventLines(stream)) lines.push(line);
  expect(lines).toEqual([input]);
  const truncated = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, -1));
      controller.close();
    },
  });
  await expect(
    (async () => {
      for await (const _line of daemonEventLines(truncated)) {
        /* read */
      }
    })(),
  ).rejects.toThrow("incomplete");
});

it.skipIf(process.platform === "win32")(
  "never inserts an RPC response inside a split terminal event",
  async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "raypx-proxy-lines-")),
      directory = profilePath({ dataDir });
    mkdirSync(directory, { recursive: true });
    const endpoint = {
      protocol: 1,
      version: manifest.version,
      builtAt: 0,
      epoch: crypto.randomUUID(),
      socket: join(dataDir, "host.sock"),
      token: "a".repeat(64),
    };
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const event =
        JSON.stringify({
          version: 1,
          event: "terminal.output",
          data: { id: "terminal", bytes: "x".repeat(128000) + "😀" },
        }) + "\n",
      encode = new TextEncoder();
    const server = Bun.serve({
      unix: endpoint.socket,
      fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === "/info") return Response.json(endpoint);
        if (path === "/events")
          return new Response(
            new ReadableStream<Uint8Array>({
              start(value) {
                controller = value;
                controller.enqueue(encode.encode(event.slice(0, 32000)));
              },
            }),
          );
        setTimeout(() => {
          controller!.enqueue(encode.encode(event.slice(32000)));
        }, 100);
        return Response.json({ version: 1, id: "rpc", result: true });
      },
    });
    writeFileSync(join(directory, "daemon.json"), JSON.stringify(endpoint));
    const child = Bun.spawn(
      [process.execPath, join(import.meta.dirname, "../../../fixtures/daemon/proxy.ts"), dataDir],
      { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
    );
    try {
      await expect.poll(() => Boolean(controller)).toBe(true);
      await child.stdin.write(
        JSON.stringify({ version: 1, id: "rpc", method: "runtime.info", params: {} }) + "\n",
      );
      await child.stdin.flush();
      const reader = child.stdout.getReader(),
        decoder = new TextDecoder();
      let output = "";
      while (output.split("\n").length < 3) {
        const chunk = await reader.read();
        if (chunk.done) break;
        output += decoder.decode(chunk.value, { stream: true });
      }
      const lines = output
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatchObject({ id: "rpc", result: true });
      expect(lines[1]).toMatchObject({
        event: "terminal.output",
        data: { bytes: "x".repeat(128000) + "😀" },
      });
      await child.stdin.end();
      await expect(child.exited).resolves.toBe(0);
    } finally {
      child.kill();
      await child.exited;
      await server.stop(true);
      rmSync(dataDir, { recursive: true, force: true });
    }
  },
);
