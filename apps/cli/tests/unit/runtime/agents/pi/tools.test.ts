import { expect, it } from "vite-plus/test";
import { PiRunner } from "../../../../../src/runtime/agents/harness/providers/pi";
import {
  piMessage,
  piModel,
  piScript,
  piStore,
  piTool,
  piToolCall as toolCall,
  piFinal as final,
  piAllow as allow,
} from "../../../../helpers/pi";

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
