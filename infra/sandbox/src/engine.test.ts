import { expect, it } from "vitest";
import { Engine } from "./engine.js";
it("decodes fragmented multiplexed binary stdout and stderr frames", async () => {
  const engine = new Engine(async () => new Response());
  const frame = Buffer.from([1, 0, 0, 0, 0, 0, 0, 2, 255, 0, 2, 0, 0, 0, 0, 0, 0, 1, 65]);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of frame) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const events = [];
  for await (const event of engine.output(stream)) events.push(event);
  expect(events).toEqual([
    { kind: "stdout", bytes: "/wA=" },
    { kind: "stderr", bytes: "QQ==" },
  ]);
});
it("rejects incomplete frames and suppresses raw Engine error bodies", async () => {
  const engine = new Engine(async () =>
    Response.json({ message: "private-engine-fixture" }, { status: 500 }),
  );
  await expect(engine.response("/containers/create", "POST", {})).rejects.toThrow(
    "PROVIDER_UNAVAILABLE",
  );
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Uint8Array.of(1, 0, 0));
      controller.close();
    },
  });
  await expect(
    (async () => {
      for await (const event of engine.output(stream)) void event;
    })(),
  ).rejects.toThrow("PROVIDER_UNAVAILABLE");
});
it("waits for the trusted command prefix and preserves coalesced user bytes", async () => {
  const engine = new Engine(async () => new Response());
  const payload = Buffer.from("\x1eRAYPX_READY\nabc");
  const frame = Buffer.alloc(8);
  frame[0] = 1;
  frame.writeUInt32BE(payload.length, 4);
  const events = await engine.commandEvents(new Response(Buffer.concat([frame, payload])).body!);
  const values = [];
  for await (const event of events) values.push(event);
  expect(values).toEqual([{ kind: "stdout", bytes: "YWJj" }]);
});
it("refuses OCI startup output before the helper ready prefix", async () => {
  const engine = new Engine(async () => new Response());
  const payload = Buffer.from("OCI private-runtime-fixture");
  const frame = Buffer.alloc(8);
  frame[0] = 1;
  frame.writeUInt32BE(payload.length, 4);
  await expect(
    engine.commandEvents(new Response(Buffer.concat([frame, payload])).body!),
  ).rejects.toThrow("PROVIDER_UNAVAILABLE");
});
it("writes the resolver as a root-owned read-only inode in the private volume", async () => {
  let tar!: Buffer;
  const engine = new Engine(async (_, input) => {
    tar = Buffer.from(input.body as Uint8Array);
    return new Response(null);
  });
  await engine.uploadInput("owned", "resolv.conf", Buffer.from("nameserver 1.1.1.1\n"), 0, 0o444);
  expect(Number.parseInt(tar.subarray(108, 116).toString().replace(/\0.*$/, ""), 8)).toBe(0);
  expect(Number.parseInt(tar.subarray(100, 108).toString().replace(/\0.*$/, ""), 8)).toBe(0o444);
});
it("keeps hard ceilings in supervisor arguments outside mutable helper input", async () => {
  let command: string[] = [];
  const engine = new Engine(async (path, input) => {
    if (path.includes("/archive?")) return new Response(null);
    if (path.endsWith("/exec")) {
      command = JSON.parse(input.body as string).Cmd;
      return Response.json({ Id: "owned-exec" });
    }
    return new Response(new Uint8Array());
  });
  engine.configureCommandLimits({ files: 1024, fileBytes: 268435456, pids: 128 });
  await engine.startHelper("owned", "list", { limits: { pids: 1000000 }, path: "", limit: 1 });
  expect(command.slice(2, 5)).toEqual(["python3", "-I", "/opt/raypx/home.py"]);
  expect(command.slice(-3)).toEqual(["1024", "268435456", "128"]);
});
