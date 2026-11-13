import { expect, it, vi } from "vitest";
import type { ToolCall } from "@raypx/ai";
import { createComputersService, type ComputersRepository } from "@raypx/computers/server";
import { MAX_TOOL_RESULT } from "@raypx/core/approvals";
import { computerSchema, type Computer } from "@raypx/core/computers";
import { runSchema } from "@raypx/core/conversation";
import { createMemoryComputerProvider } from "@raypx/providers/computer";
import type { SpaceScope } from "@raypx/spaces/server";
import { computerToolResult, createComputerTools } from "./computer-tools.js";

const scope = { spaceId: "space", member: { accountId: "member" } } as SpaceScope;
const run = runSchema.parse({
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
});
function fixture(knownSecrets: string[] = []) {
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
