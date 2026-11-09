import { expect, expectTypeOf, it, vi } from "vite-plus/test";
import { createLocalClient, type LocalClient } from "./local-client.ts";
import { LOCAL_WORKSPACE_ID, localParams } from "./local.ts";

// This function is checked by the workspace typecheck, never executed.
function typeContract(client: LocalClient) {
  const result = client("files.read", { rootId: "root", path: "a.txt" });
  expectTypeOf(result).toEqualTypeOf<Promise<{ text: string; version: string }>>();
  // @ts-expect-error file reads require a root and path, not an unrelated ID
  void client("files.read", { id: "wrong-method-parameter" });
  // @ts-expect-error callers cannot choose an arbitrary reply type
  void client<string>("files.read", { rootId: "root", path: "a.txt" });
  // @ts-expect-error renderer clients cannot invoke native-only registration
  void client("roots.register", { path: "/private" });
}
void typeContract;

it("selects a default terminal shell without weakening tools.run or accepting an empty executable", async () => {
  const transport = vi.fn(async () => ({ id: "terminal" }));
  const client = createLocalClient(transport);
  await expect(client("terminal.open", { cwd: "/work" })).resolves.toEqual({ id: "terminal" });
  expect(transport).toHaveBeenCalledWith("terminal.open", {
    cwd: "/work",
    args: [],
    timeoutMs: 600_000,
    cols: 80,
    rows: 24,
  });
  transport.mockClear();
  await expect(client("terminal.open", { cwd: "/work", executable: "" })).rejects.toThrow(
    /executable/,
  );
  expect(transport).not.toHaveBeenCalled();
  expect(localParams["tools.run"].safeParse({ cwd: "/work" }).success).toBe(false);
});

it("validates project and computer list filters before calling the host", async () => {
  const transport = vi.fn(async () => []),
    client = createLocalClient(transport);
  const projectId = "00000000-0000-4000-8000-000000000001",
    deviceId = "00000000-0000-4000-8000-000000000002";
  await expect(
    client("agents.local.list", { accountId: LOCAL_WORKSPACE_ID, projectId, deviceId, limit: 2 }),
  ).resolves.toEqual([]);
  expect(transport).toHaveBeenCalledWith("agents.local.list", {
    accountId: LOCAL_WORKSPACE_ID,
    projectId,
    deviceId,
    limit: 2,
  });
  transport.mockClear();
  await expect(
    client("agents.local.list", {
      accountId: LOCAL_WORKSPACE_ID,
      projectId: "invalid",
      deviceId,
      limit: 2,
    }),
  ).rejects.toThrow(/projectId/);
  expect(transport).not.toHaveBeenCalled();
});

it("rejects malformed parameters before transport and malformed native replies after transport", async () => {
  const transport = vi.fn(async () => ({ text: 42, version: "v1" }));
  const client = createLocalClient(transport);
  await expect(client("files.read", { rootId: "", path: "a" })).rejects.toThrow(/rootId/);
  expect(transport).not.toHaveBeenCalled();
  const input = { rootId: "test-root", path: "a" };
  await expect(client("files.read", input)).rejects.toThrow(/text/);
  expect(transport).toHaveBeenCalledWith("files.read", input);
});

it("returns the method's validated response", async () => {
  const client = createLocalClient(async () => ({ text: "hello", version: "v1" }));
  await expect(client("files.read", { rootId: "test-root", path: "a" })).resolves.toEqual({
    text: "hello",
    version: "v1",
  });
});

it("rejects retired account-owned local workspaces before transport", async () => {
  const transport = vi.fn();
  const client = createLocalClient(transport);
  await expect(
    client("agents.local.list", { accountId: "account-a", limit: 100 } as never),
  ).rejects.toThrow(/accountId/);
  expect(transport).not.toHaveBeenCalled();
});
