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
