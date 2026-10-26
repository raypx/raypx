import { expect, it, vi } from "vite-plus/test";
import { createAssistantMessageEventStream } from "@raypx/ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { PiRunner } from "../../../src/runtime/agents/harness/providers/pi";
import { piMessage, piModel, piScript, piStore, piTool } from "../../helpers/pi";

const toolCall = () =>
  piMessage(
    [{ type: "toolCall", id: "call-1", name: "fixture_tool", arguments: { value: "one" } }],
    "toolUse",
  );
const final = () =>
  piMessage([
    { type: "text", text: "First block" },
    { type: "text", text: "Second block" },
  ]);
const allow = async () => "allow" as const;

it("rejects a repeated tool call ID within one batch and across inference requests", async () => {
  for (const sameBatch of [true, false]) {
    const memory = piStore();
    const call = toolCall().content[0]!;
    const script = piScript(
      sameBatch ? [piMessage([call, call], "toolUse")] : [toolCall(), toolCall()],
    );
    let approvals = 0,
      effects = 0;
    const runner = new PiRunner({
      model: piModel,
      stream: script.stream,
      store: memory.store,
      authorize: async () => {
        approvals++;
        return "allow";
      },
      tools: [
        piTool(async () => {
          effects++;
          return { content: [], details: {} };
        }),
      ],
    });
    expect(await runner.run("Go")).toMatchObject({
      status: "failed",
      code: "PI_DUPLICATE_TOOL_CALL",
    });
    expect(effects).toBe(1);
    expect(approvals).toBe(1);
    expect(script.calls).toBe(sameBatch ? 1 : 2);
    expect(memory.value.pendingEffect).toBeUndefined();
  }
});

it("keeps completed tool IDs fenced after constructing a new runner", async () => {
  const memory = piStore(),
    script = piScript([toolCall(), final(), toolCall()]);
  let effects = 0;
  const options = {
    model: piModel,
    stream: script.stream,
    store: memory.store,
    authorize: allow,
    tools: [
      piTool(async () => {
        effects++;
        return { content: [], details: {} };
      }),
    ],
  };
  expect(await new PiRunner(options).run("First")).toMatchObject({ status: "succeeded" });
  expect(await new PiRunner(options).run("Replay")).toMatchObject({
    status: "failed",
    code: "PI_DUPLICATE_TOOL_CALL",
  });
  expect(effects).toBe(1);
});

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

it("runs the actual SDK loop, commits final multi-block text and authorizes before effects", async () => {
  const memory = piStore(),
    script = piScript([toolCall(), final()]);
  const order: string[] = [];
  const runner = new PiRunner({
    model: piModel,
    stream: script.stream,
    store: memory.store,
    authorize: async () => {
      order.push("approve");
      return "allow";
    },
    tools: [
      piTool(async (id) => {
        expect(memory.value.pendingEffect).toEqual({ id, name: "fixture_tool" });
        expect(memory.value.messages.at(-1)).toMatchObject({
          role: "assistant",
          stopReason: "toolUse",
        });
        order.push("execute");
        return { content: [{ type: "text", text: "Tool completed" }], details: {} };
      }),
    ],
  });
  expect(await runner.run("Go")).toEqual({
    status: "succeeded",
    text: "First block\n\nSecond block",
  });
  expect(order).toEqual(["approve", "execute"]);
  expect(script.calls).toBe(2);
  expect(memory.value).toMatchObject({ status: "succeeded" });
  expect(memory.value.pendingEffect).toBeUndefined();
  expect(JSON.stringify(memory.value.messages)).not.toContain("Partial draft");
  expect(memory.value.messages.filter((message) => message.role === "toolResult")).toHaveLength(1);
});

it("a denied or unavailable approval never executes or starts another inference", async () => {
  for (const authorize of [
    async () => "deny" as const,
    async () => {
      throw new Error("private approval error");
    },
  ]) {
    const memory = piStore(),
      script = piScript([toolCall()]);
    let executions = 0;
    const runner = new PiRunner({
      model: piModel,
      stream: script.stream,
      store: memory.store,
      authorize,
      tools: [
        piTool(async () => {
          executions++;
          return { content: [], details: {} };
        }),
      ],
    });
    expect(await runner.run("Go")).toMatchObject({ status: "failed", code: "PI_TOOL_DENIED" });
    expect(executions).toBe(0);
    expect(script.calls).toBe(1);
    expect(JSON.stringify(memory.value)).not.toContain("private approval error");
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

it("a failed tool-result commit fences the next inference and future resume", async () => {
  const memory = piStore(),
    script = piScript([toolCall(), final()]);
  let executions = 0;
  const runner = new PiRunner({
    model: piModel,
    stream: script.stream,
    store: {
      load: () => memory.store.load(),
      commit: async (revision, context) => {
        if (context.messages.at(-1)?.role === "toolResult")
          throw new Error("private storage detail");
        return memory.store.commit(revision, context);
      },
    },
    authorize: allow,
    tools: [
      piTool(async () => {
        executions++;
        return { content: [], details: {} };
      }),
    ],
  });
  expect(await runner.run("Go")).toEqual({
    status: "failed",
    text: "",
    code: "PI_PERSISTENCE_FAILED",
  });
  expect(script.calls).toBe(1);
  expect(executions).toBe(1);
  expect(memory.value.pendingEffect).toBeDefined();
  const restarted = new PiRunner({
    model: piModel,
    stream: script.stream,
    store: memory.store,
    tools: [],
    authorize: allow,
  });
  expect(await restarted.run("Try again")).toMatchObject({ code: "PI_RECOVERY_REQUIRED" });
  expect(script.calls).toBe(1);
});

it("a failed intent commit prevents the tool effect itself", async () => {
  const memory = piStore(),
    script = piScript([toolCall()]);
  let executions = 0;
  const runner = new PiRunner({
    model: piModel,
    stream: script.stream,
    store: {
      load: () => memory.store.load(),
      commit: async (revision, context) => {
        if (context.pendingEffect) throw new Error("private store error");
        return memory.store.commit(revision, context);
      },
    },
    authorize: allow,
    tools: [
      piTool(async () => {
        executions++;
        return { content: [], details: {} };
      }),
    ],
  });
  expect(await runner.run("Go")).toMatchObject({ code: "PI_PERSISTENCE_FAILED" });
  expect(executions).toBe(0);
  expect(script.calls).toBe(1);
});

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

it("commits each result before authorizing the next tool in one SDK batch", async () => {
  const memory = piStore();
  const script = piScript([
    piMessage(
      [
        { type: "toolCall", id: "first", name: "fixture_tool", arguments: { value: "one" } },
        { type: "toolCall", id: "second", name: "fixture_tool", arguments: { value: "two" } },
      ],
      "toolUse",
    ),
    final(),
  ]);
  const executed: string[] = [];
  const previousResults: string[] = [];
  const runner = new PiRunner({
    model: piModel,
    stream: script.stream,
    store: memory.store,
    authorize: async () => {
      expect(memory.value.pendingEffect).toBeUndefined();
      const previous = memory.value.messages.at(-1);
      previousResults.push(previous?.role === "toolResult" ? previous.toolCallId : "");
      return "allow";
    },
    tools: [
      piTool(async (id) => {
        expect(memory.value.pendingEffect?.id).toBe(id);
        executed.push(id);
        return { content: [], details: {} };
      }),
    ],
  });
  expect(await runner.run("Two effects")).toMatchObject({ status: "succeeded" });
  expect(executed).toEqual(["first", "second"]);
  expect(previousResults).toEqual(["", "first"]);
  expect(memory.value.messages.filter((message) => message.role === "toolResult")).toHaveLength(2);
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

it("an unknown tool outcome is never resumed and raw errors stay private", async () => {
  const memory = piStore(),
    script = piScript([toolCall(), final()]);
  const runner = new PiRunner({
    model: piModel,
    stream: script.stream,
    store: memory.store,
    authorize: allow,
    tools: [
      piTool(async () => {
        throw new Error("secret-tool-credential");
      }),
    ],
  });
  const result = await runner.run("Go");
  expect(result).toMatchObject({ status: "failed", code: "PI_TOOL_FAILED" });
  expect(script.calls).toBe(1);
  expect(memory.value.status).toBe("uncertain");
  expect(memory.value.pendingEffect).toBeDefined();
  expect(JSON.stringify([result, memory.value])).not.toContain("secret-tool-credential");
  expect(await runner.run("Go again")).toMatchObject({ code: "PI_RECOVERY_REQUIRED" });
  expect(script.calls).toBe(1);
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
