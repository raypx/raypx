import { afterEach, expect, it } from "vite-plus/test";
import { serveHttp, directHttpClient } from "./http.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { WebSocket } from "ws";
import { once } from "node:events";
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((close) => close()));
});
it("rejects oversized streamed HTTP bodies and preserves separate response cookies", async () => {
  let calls = 0;
  const server = await serveHttp({
    hostname: "127.0.0.1",
    port: 0,
    maxRequestBodySize: 4,
    fetch: async (request) => {
      calls++;
      return new Response(await request.text(), {
        headers: [
          ["set-cookie", "a=1"],
          ["set-cookie", "b=2"],
        ],
      });
    },
  });
  cleanups.push(() => server.stop(true));
  const response = await fetch(server.url, { method: "POST", body: "four" });
  expect(await response.text()).toBe("four");
  expect(response.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
  expect((await fetch(server.url, { method: "POST", body: "large" })).status).toBe(413);
  const streamed = await new Promise<number>((resolve, reject) => {
    const child = httpRequest(server.url, { method: "POST" }, (reply) => {
      reply.resume();
      resolve(reply.statusCode!);
    });
    child.on("error", reject);
    child.write("one");
    child.end("two");
  });
  expect(streamed).toBe(413);
  expect(calls).toBe(1);
});
it.skipIf(process.platform === "win32")(
  "connects directly to private sockets and ignores global proxy dispatch",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "raypx-http-")),
      path = join(directory, "private.sock");
    const server = await serveHttp({
      unix: path,
      fetch: (request) => new Response(request.headers.get("authorization")),
    });
    const client = directHttpClient(path);
    cleanups.push(async () => {
      await client.close();
      await server.stop(true);
      await rm(directory, { recursive: true, force: true });
    });
    const response = await client.fetch("http://private.invalid/info", {
      headers: { authorization: "Bearer synthetic-private" },
    });
    expect(await response.text()).toBe("Bearer synthetic-private");
  },
);
it("cancels a streamed response when its TCP client disconnects", async () => {
  let cancelled = false;
  const server = await serveHttp({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(100));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  });
  cleanups.push(() => server.stop(true));
  await new Promise<void>((resolve, reject) => {
    const child = httpRequest(server.url, (response) => {
      response.once("data", () => {
        response.destroy();
        resolve();
      });
    });
    child.on("error", reject);
    child.end();
  });
  await expect.poll(() => cancelled).toBe(true);
});
it("authorizes upgrades before exposing WebSocket peers and closes oversized frames", async () => {
  const server = await serveHttp<{ id: string }>({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, listener) {
      if (request.headers.get("authorization") !== "Bearer synthetic")
        return new Response(null, { status: 403 });
      if (!listener.upgrade(request, { data: { id: "peer" } }))
        return new Response(null, { status: 400 });
    },
    websocket: {
      maxPayloadLength: 8,
      message(peer, message) {
        peer.send(`${peer.data.id}:${String(message)}`);
      },
    },
  });
  cleanups.push(() => server.stop(true));
  const url = new URL(server.url);
  url.protocol = "ws:";
  const denied = new WebSocket(url);
  const failure = new Promise<number>((resolve) =>
    denied.once("unexpected-response", (_request, response) => {
      response.resume();
      denied.terminate();
      resolve(response.statusCode!);
    }),
  );
  denied.on("error", () => {});
  expect(await failure).toBe(403);
  const socket = new WebSocket(url, { headers: { authorization: "Bearer synthetic" } });
  socket.on("error", () => {});
  await once(socket, "open");
  socket.send("ok");
  expect(String((await once(socket, "message"))[0])).toBe("peer:ok");
  socket.send("too large");
  expect((await once(socket, "close"))[0]).toBe(1009);
});
