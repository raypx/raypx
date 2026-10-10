import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test, vi } from "vite-plus/test";

let child: ChildProcess;
let baseURL: string;
let output = "";
const records: Record<string, unknown>[] = [];
beforeAll(async () => {
  const entry = new URL("../src/http.ts", import.meta.url).href;
  const loggerEntry = new URL("../../logger/src/index.ts", import.meta.url).href;
  const program = `
    const {withHttpRequest, readRequestBody, getRequestContext} = await import(${JSON.stringify(entry)});
    const {createLogger} = await import(${JSON.stringify(loggerEntry)});
    const emit = value => process.stdout.write(JSON.stringify(value)+'\\n');
    const server = Bun.serve({hostname:'127.0.0.1',port:0,idleTimeout:0,
      fetch(request) {return withHttpRequest(request, async context => {
        context.signal.addEventListener('abort',()=>emit({kind:'io-aborted',requestId:context.requestId}),{once:true});
        if(request.method==='POST') {
          const body=await readRequestBody(request,{maxBytes:8,timeoutMs:60});
          return Response.json({text:new TextDecoder().decode(body)});
        }
        if(new URL(request.url).pathname==='/stream') {
          let first=true;
          return new Response(new ReadableStream({
            pull(controller) {
              emit({kind:'pull',requestId:getRequestContext()?.requestId});
              if(first){first=false;controller.enqueue(new TextEncoder().encode('ready'));}
            },
            cancel(){emit({kind:'source-cancelled',requestId:getRequestContext()?.requestId});}
          },{highWaterMark:0}));
        }
        return new Response('normal');
      },{logger:createLogger({level:'silent'}),observeLifecycle:event=>emit(event)});}
    });
    process.on('SIGTERM',async()=>{await server.stop(true);process.exit(0)});
    emit({kind:'listening',url:server.url.href});
  `;
  child = spawn("bun", ["--no-env-file", "-e", program], {
    cwd: fileURLToPath(new URL("../../../", import.meta.url)),
    env: { PATH: process.env.PATH, NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let pending = "";
  child.stdout!.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    pending += chunk.toString();
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      const value: unknown = JSON.parse(line);
      if (value && typeof value === "object") records.push(value as Record<string, unknown>);
    }
  });
  child.stderr!.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  await vi.waitFor(
    () => {
      if (child.exitCode !== null) throw new Error(`Bun fixture failed: ${output}`);
      const listening = records.find((record) => record.kind === "listening");
      if (!listening) throw new Error("Bun fixture has not started listening");
      baseURL = String(listening.url);
    },
    { timeout: 5000 },
  );
}, 7000);
afterAll(async () => {
  if (!child || child.exitCode !== null) return;
  const closed = once(child, "close");
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 2000);
  try {
    await closed;
  } finally {
    clearTimeout(timeout);
  }
});

test("real Bun counts a chunked body and returns correlated 413 without leaking content", async () => {
  const response = await new Promise<{
    status: number;
    body: string;
    requestId: string | string[] | undefined;
  }>((resolve, reject) => {
    const outgoing = httpRequest(
      new URL("body", baseURL),
      { method: "POST", headers: { "x-request-id": "bun-chunked" } },
      (incoming) => {
        let body = "";
        incoming.on("data", (chunk: Buffer) => {
          body += chunk;
        });
        incoming.on("end", () =>
          resolve({
            status: incoming.statusCode!,
            body,
            requestId: incoming.headers["x-request-id"],
          }),
        );
      },
    );
    outgoing.on("error", reject);
    outgoing.write("1234");
    outgoing.end("56789");
  });
  expect(response.status).toBe(413);
  expect(response.requestId).toBe("bun-chunked");
  expect(JSON.parse(response.body)).toMatchObject({
    error: { code: "PAYLOAD_TOO_LARGE", requestId: "bun-chunked" },
  });
  expect(response.body).not.toContain("1234");
});

test("real Bun body deadline returns 408 while the client is still uploading", async () => {
  const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const outgoing = httpRequest(
      new URL("body", baseURL),
      { method: "POST", headers: { "content-length": "4", "x-request-id": "bun-deadline" } },
      (incoming) => {
        let body = "";
        incoming.on("data", (chunk: Buffer) => {
          body += chunk;
        });
        incoming.on("end", () => {
          resolve({ status: incoming.statusCode!, body });
          outgoing.destroy();
        });
      },
    );
    outgoing.on("error", reject);
    outgoing.write("{");
  });
  expect(response.status).toBe(408);
  expect(JSON.parse(response.body)).toMatchObject({
    error: { code: "REQUEST_TIMEOUT", requestId: "bun-deadline" },
  });
});

test("real client disconnect cancels a Bun response, upstream IO and its request-bound source once", async () => {
  const controller = new AbortController();
  const response = await fetch(new URL("stream", baseURL), {
    signal: controller.signal,
    headers: { "x-request-id": "bun-disconnect" },
  });
  expect(new TextDecoder().decode((await response.body!.getReader().read()).value)).toBe("ready");
  controller.abort();
  await vi.waitFor(
    () => {
      expect(
        records.filter(
          (record) => record.requestId === "bun-disconnect" && record.phase === "response-finished",
        ),
      ).toEqual([expect.objectContaining({ status: 200, outcome: "cancelled" })]);
      expect(
        records.filter(
          (record) => record.requestId === "bun-disconnect" && record.kind === "io-aborted",
        ),
      ).toHaveLength(1);
      expect(
        records.filter(
          (record) => record.requestId === "bun-disconnect" && record.kind === "source-cancelled",
        ),
      ).toHaveLength(1);
    },
    { timeout: 3000 },
  );
  const healthy = await fetch(baseURL);
  expect(await healthy.text()).toBe("normal");
});
