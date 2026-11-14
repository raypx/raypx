import { expect, it, vi } from "vitest";
import type { ToolCall } from "@raypx/ai";
import { createComputersService, type ComputersRepository } from "@raypx/computers/server";
import { MAX_TOOL_RESULT } from "@raypx/core/approvals";
import { computerSchema, type Computer } from "@raypx/core/computers";
import { runSchema } from "@raypx/core/conversation";
import type { ExecutionRun } from "./conversations.js";
import { createMemoryComputerProvider } from "@raypx/providers/computer";
import type { SpaceScope } from "@raypx/spaces/server";
import { computerToolResult, createComputerTools } from "./computer-tools.js";
import type { ComputerUseQueue } from "./computer-tools.js";
import { deferred } from "../tests/support/computer-fixture.js";

const scope = { spaceId: "space", member: { accountId: "member" } } as SpaceScope;
const run: ExecutionRun = {
  ...runSchema.parse({
    id: "run",
    spaceId: "space",
    conversationId: "conversation",
    agentId: "agent",
    trigger: "message",
    messageId: "message",
    memberAccountId: "member",
    model: { modelId: "fixture" },
    state: "running",
    failureCode: null,
    createdAt: new Date(0).toISOString(),
    startedAt: new Date(0).toISOString(),
    firstResponseAt: null,
    finishedAt: null,
  }),
  ownerId: "fixture",
  fence: 1,
  attemptId: "attempt",
  attemptNumber: 1,
  timeoutAt: new Date(900_000).toISOString(),
  connectionId: null,
  computerId: null,
  computerGeneration: null,
};
function fixture(knownSecrets: string[] | (() => readonly string[]) = []) {
  run.computerId = null;
  run.computerGeneration = null;
  run.startedAt = null;
  run.untrustedInput = false;
  run.computerInputPaused = false;
  run.state = "running";
  let row: Computer | null = null;
  const repository: ComputersRepository = {
    get: vi.fn(async () => row),
    claim: vi.fn(async (_, operation) => {
      row = computerSchema.parse({
        id: crypto.randomUUID(),
        spaceId: scope.spaceId,
        scope: "team",
        agentId: null,
        provider: "memory",
        state: operation === "start" ? "starting" : "stopping",
        generation: (row?.generation ?? 0) + 1,
        homeRevision: null,
        leaseOwner: "fixture",
        leaseExpiresAt: new Date(60_000).toISOString(),
        leaseFence: 1,
        failureCode: null,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      });
      return row;
    }),
    complete: vi.fn(
      async (
        _: SpaceScope,
        claim: Computer,
        result: Pick<Computer, "state" | "homeRevision" | "failureCode">,
      ) => {
        const completed: Computer = { ...claim, ...result, leaseOwner: null, leaseExpiresAt: null };
        row = completed;
        return completed;
      },
    ),
  };
  const provider = createMemoryComputerProvider();
  const service = createComputersService(repository, provider, "memory");
  const tools = createComputerTools(service, provider, knownSecrets);
  const signal = new AbortController().signal;
  function prepare(name: string, args: ToolCall["arguments"], id = "call") {
    return tools.prepare({ type: "toolCall", id, name, arguments: args });
  }
  async function execute(name: string, args: ToolCall["arguments"]) {
    return JSON.parse(await tools.execute(scope, run, prepare(name, args), signal));
  }
  return { tools, provider, service, repository, prepare, execute, row: () => row };
}

it("exposes graphical tools only after capability admission and keeps image bytes out of results", async () => {
  const f = fixture();
  const signal = new AbortController().signal;
  expect(f.tools.definitions().some((tool) => tool.name === "computer_screenshot")).toBe(false);
  await f.tools.initialize!(scope, run, signal);
  expect(f.tools.definitions().map((tool) => tool.name)).toEqual(
    expect.arrayContaining(["computer_screenshot", "computer_pointer", "computer_keyboard"]),
  );
  const ref = { id: f.row()!.id, generation: f.row()!.generation };
  await f.provider.startScreen!(ref);
  const call = {
    type: "toolCall" as const,
    id: "capture",
    name: "computer_screenshot",
    arguments: {},
  };
  const prepared = f.tools.prepare(call);
  expect(prepared).toMatchObject({ changes: false, recordEffect: true, target: "screen" });
  const output = await f.tools.execute(scope, run, prepared, signal);
  expect(JSON.parse(output)).toMatchObject({ state: "succeeded", trust: "untrusted" });
  const content = f.tools.modelContent!(run, call, output);
  const image = content.find((part) => part.type === "image");
  expect(image).toMatchObject({ type: "image", mimeType: "image/png" });
  if (image?.type !== "image") throw new Error("Missing model screenshot");
  expect(Buffer.from(image.data, "base64").subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(output).not.toContain(image.data);
  expect(run.untrustedInput).toBe(true);
  expect(f.tools.modelContent!(run, call, output)).toEqual([
    { type: "text", text: output },
    { type: "text", text: expect.stringContaining("no image available") },
  ]);
});

it("refuses graphical tools when the provider does not advertise screen capability", async () => {
  const f = fixture();
  const description = await f.provider.describe();
  vi.spyOn(f.provider, "describe").mockResolvedValue({ ...description, screen: false });
  await f.tools.initialize!(scope, run, new AbortController().signal);
  expect(f.tools.definitions().some((tool) => tool.name === "computer_screenshot")).toBe(false);
  expect(() => f.prepare("computer_screenshot", {})).toThrow("INVALID_TOOL");
});

it.each(["computer_keyboard", "computer_run_command"] as const)(
  "pauses %s during takeover before effects or provider dispatch and resumes on release",
  async (name) => {
    const f = fixture();
    let controlled = true;
    const states: boolean[] = [];
    const tools = createComputerTools(f.service, f.provider, [], undefined, undefined, {
      async withAgentInput(_scope, _ref, operation) {
        if (controlled)
          throw Object.assign(new Error("SCREEN_CONTROL_HELD"), { code: "SCREEN_CONTROL_HELD" });
        return operation();
      },
      async setPaused(_scope, selected, paused) {
        states.push(paused);
        selected.computerInputPaused = paused;
        selected.state = paused ? "waiting" : "running";
      },
    });
    const signal = new AbortController().signal;
    await tools.initialize!(scope, run, signal);
    await f.provider.startScreen!({ id: f.row()!.id, generation: f.row()!.generation });
    const input = vi.spyOn(f.provider, "input");
    const command = vi.spyOn(f.provider, "execute");
    const args =
      name === "computer_keyboard"
        ? { kind: "text", text: "private typed content" }
        : { executable: "printf", argv: ["private typed content"], cwd: "." };
    const call = tools.prepare({
      type: "toolCall",
      id: "type",
      name,
      arguments: args,
    });
    expect(call.argumentSummary).not.toContain("private typed content");
    expect(call).toMatchObject({ changes: true });
    let effects = 0;
    const result = tools.withDriver!(scope, run, call, signal, async () => {
      effects++;
      return tools.execute(scope, run, call, signal);
    });
    await vi.waitFor(() => expect(states).toEqual([true]));
    expect(run.state).toBe("waiting");
    expect(input).not.toHaveBeenCalled();
    expect(command).not.toHaveBeenCalled();
    expect(effects).toBe(0);
    const sibling = { ...run, id: "reading-child" as ExecutionRun["id"], parentRunId: run.id };
    const read = tools.prepare({
      type: "toolCall",
      id: "read",
      name: "computer_list_files",
      arguments: { path: "." },
    });
    expect(JSON.parse(await tools.execute(scope, sibling, read, signal))).toMatchObject({
      state: "succeeded",
    });
    expect(effects).toBe(0);
    controlled = false;
    expect(JSON.parse(await result)).toMatchObject({ state: "succeeded" });
    expect(states).toEqual([true, false]);
    expect(run.state).toBe("running");
    expect(input).toHaveBeenCalledTimes(name === "computer_keyboard" ? 1 : 0);
    expect(command).toHaveBeenCalledTimes(name === "computer_run_command" ? 1 : 0);
    expect(effects).toBe(1);
  },
);

it("cancels takeover-paused screen input without dispatch and rejects oversized screenshots", async () => {
  const f = fixture();
  const paused = vi.fn(async () => {});
  const tools = createComputerTools(f.service, f.provider, [], undefined, undefined, {
    async withAgentInput() {
      throw Object.assign(new Error("SCREEN_CONTROL_HELD"), { code: "SCREEN_CONTROL_HELD" });
    },
    setPaused: paused,
  });
  const controller = new AbortController();
  await tools.initialize!(scope, run, controller.signal);
  const input = vi.spyOn(f.provider, "input");
  const call = tools.prepare({
    type: "toolCall",
    id: "point",
    name: "computer_pointer",
    arguments: { x: 2, y: 4, action: "move" },
  });
  const result = tools.execute(scope, run, call, controller.signal);
  await vi.waitFor(() => expect(paused).toHaveBeenCalledWith(scope, run, true));
  controller.abort("cancelled");
  expect(JSON.parse(await result).state).toBe("cancelled");
  expect(input).not.toHaveBeenCalled();
  await f.provider.startScreen!({ id: f.row()!.id, generation: f.row()!.generation });
  vi.spyOn(f.provider, "screenshot").mockResolvedValue({
    sequence: 0,
    width: 1024,
    height: 768,
    mimeType: "image/png",
    bytes: Buffer.alloc(1024 * 1024 + 1).toString("base64"),
  });
  await expect(
    tools.execute(
      scope,
      run,
      tools.prepare({
        type: "toolCall",
        id: "oversized",
        name: "computer_screenshot",
        arguments: {},
      }),
      new AbortController().signal,
    ),
  ).rejects.toThrow("COMPUTER_UNAVAILABLE");
});

it("queues children's computer calls across executor ports while other Agents proceed", async () => {
  const f = fixture();
  const holders = new Map<string, string>();
  const queue: ComputerUseQueue = {
    async acquire(_, selected) {
      if (holders.has(selected.agentId)) return false;
      holders.set(selected.agentId, selected.id);
      return true;
    },
    async release(_, selected) {
      expect(holders.get(selected.agentId)).toBe(selected.id);
      holders.delete(selected.agentId);
    },
  };
  const first = createComputerTools(f.service, f.provider, [], undefined, queue);
  const second = createComputerTools(f.service, f.provider, [], undefined, queue);
  const signal = new AbortController().signal;
  await first.initialize!(scope, run, signal);
  const child = { ...run, id: "child" as ExecutionRun["id"], parentRunId: run.id };
  const otherAgent = {
    ...child,
    id: "other-child" as ExecutionRun["id"],
    agentId: "other-agent" as ExecutionRun["agentId"],
  };
  const started = deferred<void>();
  const unblock = deferred<void>();
  const originalWrite = f.provider.write.bind(f.provider);
  const paths: string[] = [];
  vi.spyOn(f.provider, "write").mockImplementation(async (ref, path, bytes) => {
    paths.push(path);
    if (path === "first") {
      started.resolve();
      await unblock.promise;
    }
    return originalWrite(ref, path, bytes);
  });
  const call = (id: string, path: string) =>
    first.prepare({
      type: "toolCall",
      id,
      name: "computer_write_file",
      arguments: { path, content: path },
    });
  const parentCall = first.execute(scope, run, call("one", "first"), signal);
  await started.promise;
  const childCall = second.execute(scope, child, call("two", "second"), signal);
  await second.execute(scope, otherAgent, call("three", "other"), signal);
  expect(paths).toEqual(["first", "other"]);
  unblock.resolve();
  await Promise.all([parentCall, childCall]);
  expect(paths).toEqual(["first", "other", "second"]);
  expect(holders.size).toBe(0);
});

it("cancels a child queued for a computer without invoking the provider", async () => {
  const f = fixture();
  const tools = createComputerTools(f.service, f.provider, [], undefined, {
    acquire: async () => false,
    release: async () => {
      throw new Error("No slot was acquired");
    },
  });
  const write = vi.spyOn(f.provider, "write");
  const controller = new AbortController();
  const result = tools.execute(
    scope,
    run,
    tools.prepare({
      type: "toolCall",
      id: "queued",
      name: "computer_write_file",
      arguments: { path: "unused", content: "unused" },
    }),
    controller.signal,
  );
  controller.abort("cancelled");
  expect(JSON.parse(await result)).toMatchObject({ state: "cancelled" });
  expect(write).not.toHaveBeenCalled();
});

it("checks request-owned credentials before returning any tool result", async () => {
  const values: string[] = [];
  const f = fixture(() => values);
  const tools = f.tools;
  const signal = new AbortController().signal;
  await tools.initialize!(scope, run, signal);
  const row = f.row()!;
  const ref = { id: row.id, generation: row.generation };
  const secret = "member-credential-private-value";
  await f.provider.write(ref, "private.txt", Buffer.from(secret).toString("base64"));
  values.push(secret);
  expect(() =>
    tools.guardInput!({
      type: "toolCall",
      id: "delegate",
      name: "agent_delegate",
      arguments: { task: secret },
    }),
  ).toThrow("SECRET_INPUT");
  await expect(f.execute("computer_read_file", { path: "private.txt" })).rejects.toThrow(
    "SECRET_OUTPUT",
  );
  expect(() => f.prepare("computer_write_file", { path: "file", content: secret })).toThrow(
    "SECRET_INPUT",
  );
  values.splice(0);
  expect(f.prepare("computer_write_file", { path: "file", content: secret })).toHaveProperty(
    "name",
    "computer_write_file",
  );
});

it("offers nothing and allocates nothing without a configured provider", () => {
  const f = fixture();
  const tools = createComputerTools(f.service, null);
  expect(tools.definitions()).toEqual([]);
  expect(() =>
    tools.prepare({ type: "toolCall", id: "call", name: "computer_list_files", arguments: {} }),
  ).toThrow("INVALID_TOOL");
  expect(f.repository.get).not.toHaveBeenCalled();
  expect(f.repository.claim).not.toHaveBeenCalled();
});

it("defines JSON Schema once, validates before allocation, and excludes file content from summaries", () => {
  const f = fixture();
  const definitions = f.tools.definitions();
  expect(definitions.map((tool) => tool.name)).toEqual([
    "computer_list_files",
    "computer_read_file",
    "computer_write_file",
    "computer_run_command",
  ]);
  expect(definitions.every((tool) => "properties" in tool.parameters)).toBe(true);
  expect(() => f.prepare("computer_read_file", { path: "../outside" })).toThrow(
    "INVALID_ARGUMENTS",
  );
  expect(() => f.prepare("computer_read_file", { path: "/outside" })).toThrow("INVALID_ARGUMENTS");
  expect(() => f.prepare("computer_run_command", { command: "echo hi" })).toThrow(
    "INVALID_ARGUMENTS",
  );
  const call = f.prepare("computer_write_file", {
    path: "note.txt",
    content: "private file content",
  });
  expect(call).toMatchObject({ target: "note.txt", changes: true });
  expect(call.argumentSummary).not.toContain("private file content");
  expect(f.prepare("computer_list_files", {}).changes).toBe(false);
  expect(f.repository.claim).not.toHaveBeenCalled();
});

it("starts lazily through the lifecycle service, then lists, reads and writes through the Computer port", async () => {
  const f = fixture();
  const provision = vi.spyOn(f.provider, "provision");
  const write = vi.spyOn(f.provider, "write");
  expect(f.row()).toBeNull();
  expect(
    await f.execute("computer_write_file", { path: "notes/hello.txt", content: "你好" }),
  ).toMatchObject({ state: "succeeded", trust: "untrusted", truncated: false });
  expect(write).toHaveBeenCalledWith(
    { id: f.row()!.id, generation: 1 },
    "notes/hello.txt",
    Buffer.from("你好").toString("base64"),
  );
  const read = await f.execute("computer_read_file", { path: "notes/hello.txt" });
  expect(read.content).toBe("你好");
  const list = await f.execute("computer_list_files", { path: "notes" });
  expect(JSON.parse(list.content)).toEqual([{ path: "notes/hello.txt", kind: "file" }]);
  expect(provision).toHaveBeenCalledTimes(1);
});

it("passes exact executable and argv without an implicit shell or environment", async () => {
  const f = fixture();
  const execute = vi.spyOn(f.provider, "execute");
  const result = await f.execute("computer_run_command", {
    executable: "printf",
    argv: ["literal; $(no-shell)"],
    cwd: ".",
  });
  expect(JSON.parse(result.content)).toEqual({
    stdout: "literal; $(no-shell)",
    stderr: "",
    exitStatus: 0,
  });
  expect(execute).toHaveBeenCalledWith(expect.anything(), {
    executable: "printf",
    argv: ["literal; $(no-shell)"],
    cwd: ".",
    environment: {},
    outputBudget: 32768,
  });
  expect(
    f.prepare("computer_run_command", { executable: "printf", argv: ["hidden argument"], cwd: "." })
      .argumentSummary,
  ).not.toContain("hidden argument");
});

it("bounds the entire serialized result, labels it untrusted, and reports truncation", async () => {
  const f = fixture();
  await f.execute("computer_write_file", { path: "long.txt", content: '🧑"\n'.repeat(5000) });
  const result = await f.tools.execute(
    scope,
    run,
    f.prepare("computer_read_file", { path: "long.txt" }),
    new AbortController().signal,
  );
  expect(result.length).toBeLessThanOrEqual(MAX_TOOL_RESULT);
  expect(JSON.parse(result)).toMatchObject({
    trust: "untrusted",
    truncated: true,
    state: "succeeded",
  });
  expect(JSON.parse(result).content.length).toBeGreaterThan(0);
  const command = await f.tools.execute(
    scope,
    run,
    f.prepare("computer_run_command", {
      executable: "printf",
      argv: ["x".repeat(20_000)],
      cwd: ".",
    }),
    new AbortController().signal,
  );
  expect(command.length).toBeLessThanOrEqual(MAX_TOOL_RESULT);
  expect(JSON.parse(command).truncated).toBe(true);
  expect(computerToolResult("failed", "\0".repeat(40_000)).length).toBeLessThanOrEqual(
    MAX_TOOL_RESULT,
  );
});

it("rejects known secret inputs before allocation and secret output before return", async () => {
  const f = fixture(["deployment-secret"]);
  expect(() =>
    f.prepare("computer_write_file", { path: "note", content: "deployment-secret" }),
  ).toThrow("SECRET_INPUT");
  expect(() =>
    f.prepare("computer_run_command", {
      executable: "printf",
      argv: ["deployment-secret"],
      cwd: ".",
    }),
  ).toThrow("SECRET_INPUT");
  expect(f.repository.claim).not.toHaveBeenCalled();
  await f.service.start(scope);
  const ref = { id: f.row()!.id, generation: f.row()!.generation };
  await f.provider.write(ref, "private", Buffer.from("deployment-secret").toString("base64"));
  await expect(f.execute("computer_read_file", { path: "private" })).rejects.toThrow(
    "SECRET_OUTPUT",
  );
});

it("stop cancellation reaches and drains the in-flight command", async () => {
  const f = fixture();
  const execute = vi.spyOn(f.provider, "execute");
  const pending = f.execute("computer_run_command", {
    executable: "sleep",
    argv: ["60"],
    cwd: ".",
  });
  await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  await f.tools.cancel(scope, run);
  expect(await pending).toMatchObject({ state: "cancelled" });
  const next = await f.execute("computer_run_command", {
    executable: "printf",
    argv: ["late"],
    cwd: ".",
  });
  expect(next).toMatchObject({ state: "cancelled", content: "CANCELLED" });
  expect(execute).toHaveBeenCalledTimes(1);
  f.tools.release(run);
});

it("never changes a Run's pinned computer generation after replacement", async () => {
  const f = fixture();
  await f.execute("computer_list_files", {});
  const ref = { id: f.row()!.id, generation: f.row()!.generation };
  await f.provider.provision({ ...ref, generation: ref.generation + 1 });
  const result = await f.execute("computer_write_file", { path: "stale", content: "refused" });
  expect(result).toMatchObject({ state: "failed", content: "COMPUTER_STALE_GENERATION" });
});

it("persists the first computer pin and validates it on a new executor without replacement", async () => {
  const f = fixture();
  const pin = vi.fn(async () => {});
  const first = createComputerTools(f.service, f.provider, [], pin);
  await first.initialize!(scope, run, new AbortController().signal);
  expect(pin).toHaveBeenCalledWith(scope, run, {
    computerId: run.computerId,
    computerGeneration: run.computerGeneration,
  });
  const resumed = { ...run, attemptId: "resumed", fence: 2 };
  const next = createComputerTools(f.service, f.provider, [], pin);
  await next.initialize!(scope, resumed, new AbortController().signal);
  expect(f.repository.claim).toHaveBeenCalledTimes(1);
  await f.service.stop(scope);
  const missing = createComputerTools(f.service, f.provider, [], pin);
  await expect(
    missing.initialize!(scope, resumed, new AbortController().signal),
  ).rejects.toMatchObject({
    code: "COMPUTER_UNAVAILABLE",
  });
  expect(f.repository.claim).toHaveBeenCalledTimes(2);
  const unconfigured = createComputerTools(f.service, null, [], pin);
  await expect(
    unconfigured.initialize!(scope, resumed, new AbortController().signal),
  ).rejects.toMatchObject({
    code: "COMPUTER_UNAVAILABLE",
  });
});

it("keeps the absence of a computer pinned when a provider appears after first start", async () => {
  const f = fixture();
  run.startedAt = new Date(0).toISOString();
  const tools = createComputerTools(f.service, f.provider);
  await tools.initialize!(scope, run, new AbortController().signal);
  expect(tools.definitions(run)).toEqual([]);
  expect(f.repository.claim).not.toHaveBeenCalled();
});

it("fails a missing supervisor computer even when its persisted lifecycle still says running", async () => {
  const f = fixture();
  await f.tools.initialize!(scope, run, new AbortController().signal);
  const pinned = { id: run.computerId!, generation: run.computerGeneration! };
  await f.provider.destroy(pinned);
  const resumed = createComputerTools(f.service, f.provider);
  await expect(
    resumed.initialize!(
      scope,
      { ...run, attemptId: "next", fence: 2 },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({
    code: "COMPUTER_UNAVAILABLE",
  });
  expect(f.repository.claim).toHaveBeenCalledTimes(1);
});

it("revalidates a removed computer when a new attempt reuses the same tools instance", async () => {
  const f = fixture();
  await f.tools.initialize!(scope, run, new AbortController().signal);
  const resumed = { ...run, attemptId: "resumed", fence: run.fence + 1 };
  vi.mocked(f.repository.get).mockResolvedValue(null);
  await expect(
    f.tools.initialize!(scope, resumed, new AbortController().signal),
  ).rejects.toMatchObject({
    code: "COMPUTER_UNAVAILABLE",
  });
  expect(f.repository.get).toHaveBeenCalledTimes(2);
  expect(f.repository.claim).toHaveBeenCalledTimes(1);
});

it("releasing an older attempt preserves a newer attempt's validated computer cache", async () => {
  const f = fixture();
  await f.tools.initialize!(scope, run, new AbortController().signal);
  const resumed = { ...run, attemptId: "resumed", fence: run.fence + 1 };
  await f.tools.initialize!(scope, resumed, new AbortController().signal);
  f.tools.release(run);
  const get = vi.mocked(f.repository.get);
  get.mockClear();
  const result = await f.tools.execute(
    scope,
    resumed,
    f.prepare("computer_list_files", {}),
    new AbortController().signal,
  );
  expect(JSON.parse(result)).toMatchObject({ state: "succeeded" });
  expect(get).not.toHaveBeenCalled();
});
