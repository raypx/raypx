import { expect, it } from "vite-plus/test";
import { createAssistantMessageEventStream } from "@raypx/ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { PiRunner } from "../../../../../src/runtime/agents/harness/providers/pi";
import {
  piMessage,
  piModel,
  piScript,
  piStore,
  piFinal as final,
  piAllow as allow,
} from "../../../../helpers/pi";

it("provider failures are sanitized and never automatically retried", async () => {
  for (const stream of [
    piScript([{ ...final(), stopReason: "error", errorMessage: "secret-key-123" }]).stream,
    (() => {
      throw new Error("secret-key-123");
    }) satisfies StreamFn,
  ]) {
    const memory = piStore();
    let calls = 0;
    const runner = new PiRunner({
      model: piModel,
      stream: (...args) => {
        calls++;
        return stream(...args);
      },
      store: memory.store,
      tools: [],
      authorize: allow,
    });
    const result = await runner.run("Go");
    expect(result).toEqual({ status: "failed", text: "", code: "PI_MODEL_FAILED" });
    expect(calls).toBe(1);
    expect(JSON.stringify([result, memory.value])).not.toContain("secret-key-123");
  }
});

it("pending, length and deferred responses cannot claim authoritative completion", async () => {
  for (const stopReason of ["pending", "length", "deferred"] as const) {
    const memory = piStore();
    let calls = 0;
    const runner = new PiRunner({
      model: piModel,
      stream: () => {
        calls++;
        const stream = createAssistantMessageEventStream();
        stream.end({ ...final(), stopReason });
        return stream;
      },
      store: memory.store,
      tools: [],
      authorize: allow,
    });
    expect(await runner.run("Go")).toEqual({
      status: "failed",
      text: "",
      code: "PI_MODEL_INCOMPLETE",
    });
    expect(calls).toBe(1);
    expect(memory.value.status).toBe("failed");
  }
});

it("an ended SDK stream without a final result fails instead of reusing an old assistant", async () => {
  for (const partial of [false, true]) {
    const memory = piStore({ messages: [final()] });
    let requests = 0;
    const runner = new PiRunner({
      model: piModel,
      stream: () => {
        requests++;
        const stream = createAssistantMessageEventStream();
        if (partial) stream.push({ type: "start", partial: final() });
        stream.end();
        return stream;
      },
      store: memory.store,
      tools: [],
      authorize: allow,
    });
    expect(await runner.run("Go")).toEqual({
      status: "failed",
      text: "",
      code: "PI_MODEL_INCOMPLETE",
    });
    await runner.cancel();
    expect(memory.value.status).toBe("failed");
    expect(requests).toBe(1);
  }
});

it("cancel waits for active iteration to end and settles when that end has no final", async () => {
  const memory = piStore();
  let started!: () => void, end!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const runner = new PiRunner({
    model: piModel,
    stream: () => {
      const stream = createAssistantMessageEventStream();
      stream.push({ type: "start", partial: final() });
      end = () => stream.end();
      started();
      return stream;
    },
    store: memory.store,
    tools: [],
    authorize: allow,
  });
  const run = runner.run("Go");
  await entered;
  let settled = false;
  const cancel = runner.cancel().then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  end();
  await cancel;
  expect(await run).toEqual({ status: "cancelled", text: "" });
  expect(memory.value.status).toBe("cancelled");
});

it("accepts the explicit authoritative final supplied to SDK end(final)", async () => {
  const memory = piStore();
  const runner = new PiRunner({
    model: piModel,
    stream: () => {
      const stream = createAssistantMessageEventStream();
      stream.push({ type: "start", partial: piMessage([{ type: "text", text: "Partial only" }]) });
      stream.end(final());
      return stream;
    },
    store: memory.store,
    tools: [],
    authorize: allow,
  });
  expect(await runner.run("Go")).toEqual({
    status: "succeeded",
    text: "First block\n\nSecond block",
  });
  expect(JSON.stringify(memory.value.messages)).not.toContain("Partial only");
});
