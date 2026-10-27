import { expect, it, vi } from "vite-plus/test";
import { createAssistantMessageEventStream } from "@raypx/ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { PiRunner } from "../../../../../src/runtime/agents/harness/providers/pi";
import {
  piModel,
  piScript,
  piStore,
  piTool,
  piToolCall as toolCall,
  piFinal as final,
  piAllow as allow,
} from "../../../../helpers/pi";

it("rejects invalid deadlines and accepts a caller's already-aborted signal without inference", async () => {
  const memory = piStore(),
    script = piScript([final()]);
  const runner = new PiRunner({
    model: piModel,
    stream: script.stream,
    store: memory.store,
    authorize: allow,
    tools: [],
  });
  for (const timeoutMs of [0, -1, NaN, 1.5, 600_001])
    expect(await runner.run("Go", { timeoutMs })).toMatchObject({ code: "PI_INVALID_INPUT" });
  expect(await runner.run("Go", { signal: AbortSignal.abort() })).toEqual({
    status: "cancelled",
    text: "",
  });
  expect(script.calls).toBe(0);
  expect(memory.writes).toHaveLength(0);
});

it("a run deadline aborts the active model and durably records a timeout without retry", async () => {
  vi.useFakeTimers();
  try {
    const memory = piStore();
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    let calls = 0;
    const stream: StreamFn = (_model, _context, options) => {
      calls++;
      const output = createAssistantMessageEventStream();
      options?.signal?.addEventListener("abort", () => {
        output.push({
          type: "error",
          reason: "aborted",
          error: { ...final(), stopReason: "aborted" },
        });
      });
      started();
      return output;
    };
    const runner = new PiRunner({
      model: piModel,
      stream,
      store: memory.store,
      authorize: allow,
      tools: [],
    });
    const result = runner.run("Go", { timeoutMs: 500 });
    await entered;
    await vi.advanceTimersByTimeAsync(500);
    expect(await result).toEqual({ status: "failed", text: "", code: "PI_TIMEOUT" });
    expect(memory.value.status).toBe("failed");
    expect(calls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it("caller cancellation waits for an uncooperative tool before permitting another run", async () => {
  const memory = piStore(),
    script = piScript([toolCall()]);
  const controller = new AbortController();
  let started!: () => void, release!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const runner = new PiRunner({
    model: piModel,
    stream: script.stream,
    store: memory.store,
    authorize: allow,
    tools: [
      piTool(async (_id, _args, signal) => {
        started();
        await gate;
        expect(signal?.aborted).toBe(true);
        return { content: [], details: {} };
      }),
    ],
  });
  let settled = false;
  const result = runner.run("Go", { signal: controller.signal }).then((value) => {
    settled = true;
    return value;
  });
  await entered;
  controller.abort();
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(await runner.run("Concurrent")).toMatchObject({ code: "PI_BUSY" });
  release();
  expect(await result).toEqual({ status: "cancelled", text: "" });
  expect(memory.value.status).toBe("cancelled");
  expect(memory.value.pendingEffect).toBeUndefined();
});

it("a timed-out tool with an unknown outcome remains fenced after draining", async () => {
  vi.useFakeTimers();
  try {
    const memory = piStore(),
      script = piScript([toolCall()]);
    let started!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runner = new PiRunner({
      model: piModel,
      stream: script.stream,
      store: memory.store,
      authorize: allow,
      tools: [
        piTool(async (_id, _args, signal) => {
          started();
          await gate;
          expect(signal?.aborted).toBe(true);
          throw new Error("private, uncertain effect");
        }),
      ],
    });
    let settled = false;
    const result = runner.run("Go", { timeoutMs: 500 }).then((value) => {
      settled = true;
      return value;
    });
    await entered;
    await vi.advanceTimersByTimeAsync(500);
    expect(settled).toBe(false);
    expect(await runner.run("Replacement")).toMatchObject({ code: "PI_BUSY" });
    release();
    expect(await result).toEqual({ status: "failed", text: "", code: "PI_TIMEOUT" });
    expect(memory.value.status).toBe("uncertain");
    expect(memory.value.pendingEffect?.id).toBe("call-1");
    expect(await runner.run("Retry")).toMatchObject({ code: "PI_RECOVERY_REQUIRED" });
    expect(script.calls).toBe(1);
    expect(JSON.stringify(memory.value)).not.toContain("private, uncertain effect");
  } finally {
    vi.useRealTimers();
  }
});

it("keeps the first cancellation cause when a caller aborts before the deadline", async () => {
  vi.useFakeTimers();
  try {
    const controller = new AbortController();
    const memory = piStore(),
      script = piScript([toolCall()]);
    let started!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runner = new PiRunner({
      model: piModel,
      stream: script.stream,
      store: memory.store,
      authorize: allow,
      tools: [
        piTool(async () => {
          started();
          await gate;
          return { content: [], details: {} };
        }),
      ],
    });
    const result = runner.run("Go", { signal: controller.signal, timeoutMs: 500 });
    await entered;
    controller.abort();
    await vi.advanceTimersByTimeAsync(500);
    release();
    expect(await result).toEqual({ status: "cancelled", text: "" });
    expect(memory.value.status).toBe("cancelled");
  } finally {
    vi.useRealTimers();
  }
});

it("reports an initial store read failure even when the run deadline already expired", async () => {
  vi.useFakeTimers();
  try {
    let rejectLoad!: (error: Error) => void;
    const load = new Promise<never>((_resolve, reject) => {
      rejectLoad = reject;
    });
    const script = piScript([final()]);
    const runner = new PiRunner({
      model: piModel,
      stream: script.stream,
      store: { load: () => load, commit: async () => 1 },
      authorize: allow,
      tools: [],
    });
    const result = runner.run("Go", { timeoutMs: 500 });
    await vi.advanceTimersByTimeAsync(500);
    rejectLoad(new Error("private failed read"));
    expect(await result).toEqual({ status: "failed", text: "", code: "PI_PERSISTENCE_FAILED" });
    expect(script.calls).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it("preserves a completed outcome when its terminal commit crosses the deadline", async () => {
  vi.useFakeTimers();
  try {
    const memory = piStore(),
      script = piScript([final()]);
    let started!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runner = new PiRunner({
      model: piModel,
      stream: script.stream,
      store: {
        load: () => memory.store.load(),
        commit: async (revision, context) => {
          if (context.status === "succeeded") {
            started();
            await gate;
          }
          return memory.store.commit(revision, context);
        },
      },
      authorize: allow,
      tools: [],
    });
    const result = runner.run("Go", { timeoutMs: 500 });
    await entered;
    await vi.advanceTimersByTimeAsync(500);
    release();
    expect(await result).toEqual({ status: "succeeded", text: "First block\n\nSecond block" });
    expect(memory.value.status).toBe("succeeded");
  } finally {
    vi.useRealTimers();
  }
});

it("cancel waits for an executing tool and its durable outcome before settling", async () => {
  const memory = piStore(),
    script = piScript([toolCall()]);
  let release!: () => void, started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let toolSettled = false;
  const runner = new PiRunner({
    model: piModel,
    stream: script.stream,
    store: memory.store,
    authorize: allow,
    tools: [
      piTool(async (_id, _args, signal) => {
        started();
        await gate;
        expect(signal?.aborted).toBe(true);
        toolSettled = true;
        return { content: [], details: {} };
      }),
    ],
  });
  const run = runner.run("Go");
  await entered;
  let cancelled = false;
  const cancel = runner.cancel().then(() => {
    cancelled = true;
  });
  await Promise.resolve();
  expect(cancelled).toBe(false);
  expect(toolSettled).toBe(false);
  release();
  await cancel;
  expect(await run).toMatchObject({ status: "cancelled" });
  expect(toolSettled).toBe(true);
  expect(memory.value.status).toBe("cancelled");
  expect(memory.value.pendingEffect).toBeUndefined();
  expect(script.calls).toBe(1);
});

it("cancel also drains an active model stream without accepting its partial text", async () => {
  const memory = piStore();
  let started!: () => void, release!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let upstreamAborted = false;
  const stream: StreamFn = (_model, _context, options) => {
    const output = createAssistantMessageEventStream();
    output.push({ type: "start", partial: final() });
    started();
    void gate.then(() => {
      upstreamAborted = options?.signal?.aborted === true;
      output.push({
        type: "error",
        reason: "aborted",
        error: { ...final(), stopReason: "aborted", errorMessage: "private abort" },
      });
    });
    return output;
  };
  const runner = new PiRunner({
    model: piModel,
    stream,
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
  release();
  await cancel;
  expect(await run).toMatchObject({ status: "cancelled", text: "" });
  expect(upstreamAborted).toBe(true);
  expect(JSON.stringify(memory.value)).not.toContain("private abort");
});

it("cancellation while the initial commit is pending cannot start inference afterward", async () => {
  const memory = piStore(),
    script = piScript([final()]);
  let entered!: () => void, release!: () => void;
  const committed = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const runner = new PiRunner({
    model: piModel,
    stream: script.stream,
    store: {
      load: () => memory.store.load(),
      commit: async (revision, context) => {
        if (revision === 0) {
          entered();
          await gate;
        }
        return memory.store.commit(revision, context);
      },
    },
    tools: [],
    authorize: allow,
  });
  const run = runner.run("Go");
  await committed;
  const cancel = runner.cancel();
  release();
  await cancel;
  expect(await run).toEqual({ status: "cancelled", text: "" });
  expect(script.calls).toBe(0);
  expect(memory.value.status).toBe("cancelled");
});

it("cancel remains pending until the terminal context commit has settled", async () => {
  const memory = piStore(),
    script = piScript([final()]);
  let entered!: () => void, release!: () => void;
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const runner = new PiRunner({
    model: piModel,
    stream: script.stream,
    store: {
      load: () => memory.store.load(),
      commit: async (revision, context) => {
        if (context.status === "succeeded") {
          entered();
          await gate;
        }
        return memory.store.commit(revision, context);
      },
    },
    tools: [],
    authorize: allow,
  });
  const run = runner.run("Go");
  await reached;
  let settled = false;
  const cancel = runner.cancel().then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  release();
  await cancel;
  // Completion already crossed the terminal-commit boundary before cancellation.
  expect(await run).toMatchObject({ status: "succeeded" });
});
