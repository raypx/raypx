import { expect, it } from "vitest";
import { createMemoryComputerProvider } from "./memory.js";

it("reads explicit UTF-8 stdin in the virtual command without host execution or file writes", async () => {
  const provider = createMemoryComputerProvider();
  const ref = { id: crypto.randomUUID(), generation: 1 };
  await provider.provision(ref);
  const command = await provider.execute(ref, {
    executable: "cat",
    argv: [],
    cwd: ".",
    environment: {},
    stdin: "输入 /+\n",
    outputBudget: 4096,
  });
  const parts: Buffer[] = [];
  let status: number | undefined;
  for await (const event of command.events) {
    if (event.kind === "stdout") parts.push(Buffer.from(event.bytes, "base64"));
    if (event.kind === "exit") status = event.status;
  }
  expect(status).toBe(0);
  expect(Buffer.concat(parts).toString()).toBe("输入 /+\n");
  expect((await provider.list(ref, ".", 100)).entries).toEqual([]);
});
