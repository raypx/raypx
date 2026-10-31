import { expect, expectTypeOf, it, vi } from "vite-plus/test";
import { createLocalClient, type LocalClient } from "../src/local-client.js";

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
