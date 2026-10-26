import { PassThrough, Writable } from "node:stream";
import { describe, expect, it } from "vite-plus/test";
import { createStreamDrain } from "../../src/stream.js";

describe("stream drain", () => {
  it("writes ordered JSON lines and flushes without ending a caller-owned stream", async () => {
    const stream = new PassThrough();
    const chunks: string[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
    const drain = createStreamDrain({ stream });
    void drain({ event: { n: 1 } });
    void drain({ event: { n: 2 } });
    await drain.flush();
    expect(chunks.join("")).toBe('{"n":1}\n{"n":2}\n');
    await drain.close();
    expect(stream.writableEnded).toBe(false);
    expect(drain({ event: { n: 3 } })).toBeUndefined();
  });

  it("reports write and serialization failures once on flush and removes its listener", async () => {
    const stream = new Writable({
      write(_chunk, _encoding, callback) {
        callback(new Error("private-write"));
      },
    });
    stream.on("error", () => {});
    const drain = createStreamDrain({ stream });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    void drain({ event: cyclic });
    void drain({ event: { n: 1 } });
    await expect(drain.flush()).rejects.toThrow("Log stream drain failed");
    await expect(drain.flush()).resolves.toBeUndefined();
    const listeners = stream.listenerCount("error");
    await drain.close();
    expect(stream.listenerCount("error")).toBe(listeners - 1);
  });

  it("drops events beyond the pending limit", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const stream = new Writable({
      write(_chunk, _encoding, callback) {
        void gate.then(() => callback());
      },
    });
    const drain = createStreamDrain({ stream, maxPending: 2 });
    void drain({ event: { n: 1 } });
    void drain({ event: { n: 2 } });
    expect(drain({ event: { n: 3 } })).toBeUndefined();
    release();
    await expect(drain.flush()).rejects.toThrow("Log stream drain failed");
  });
});
