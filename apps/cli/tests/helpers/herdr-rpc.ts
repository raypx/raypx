import assert from "node:assert/strict";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";

type Message = {
  id?: string;
  result?: { id: string };
  error?: unknown;
  event?: string;
  data?: { id: string; exitCode?: number; full?: boolean };
};

/** Exercise default runtime admission over real CLI stdio, including owner EOF. */
export async function herdrRpc(launch: string[], root: string, binary: string, command: unknown) {
  const child = Bun.spawn([...launch, "stdio", "--data-dir", root, "--profile", "herdr-rpc"], {
    env: { ...process.env, RAYPX_HERDR_BINARY: binary },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
    windowsHide: true,
  });
  const messages: Message[] = [];
  const reader = (async () => {
    for await (const line of createInterface({ input: Readable.fromWeb(child.stdout) })) {
      if (line) messages.push(JSON.parse(line));
    }
  })();
  const deadline = setTimeout(() => child.kill(), 15000);
  try {
    await child.stdin.write(
      JSON.stringify({ version: 1, id: "open", method: "terminal.open", params: command }) + "\n",
    );
    await child.stdin.flush();
    while (!messages.some((message) => message.id === "open")) {
      if (child.exitCode !== null) throw new Error("CLI terminal admission failed");
      await Bun.sleep(10);
    }
    const opened = messages.find((message) => message.id === "open")!;
    assert(!opened.error, "CLI must open the default Herdr backend");
    while (
      !messages.some(
        (message) => message.event === "terminal.exit" && message.data?.id === opened.result?.id,
      )
    ) {
      if (child.exitCode !== null) throw new Error("CLI terminal did not settle");
      await Bun.sleep(10);
    }
    assert.equal(messages.find((message) => message.event === "terminal.exit")!.data?.exitCode, 17);
    assert(
      messages.some(
        (message) => message.event === "terminal.output" && message.data?.full === true,
      ),
    );
    await child.stdin.end();
    assert.equal(await child.exited, 0);
  } finally {
    clearTimeout(deadline);
    child.kill();
    await child.exited;
    await reader;
  }
}
