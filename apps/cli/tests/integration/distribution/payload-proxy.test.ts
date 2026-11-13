import { expect, it } from "vitest";
import { readPayloadProxy } from "../../helpers/payload-proxy.js";

function proxy(stdout: string, stderr = "", exitCode = 0) {
  return Bun.spawn(
    [
      process.execPath,
      "--eval",
      `await Bun.write(Bun.stdout, ${JSON.stringify(stdout)});
await Bun.write(Bun.stderr, ${JSON.stringify(stderr)});
process.exitCode = ${exitCode};`,
    ],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );
}

it("ignores proxy heartbeats while still requiring the terminal result", async () => {
  const messages: unknown[] = [];
  await readPayloadProxy(
    proxy('\n{"id":"open","result":{}}\n\r\n{"event":"terminal.exit","data":{"exitCode":17}}\n'),
    (line) => {
      const message = JSON.parse(line);
      messages.push(message);
      return message.event === "terminal.exit" && message.data.exitCode === 17;
    },
  );
  expect(messages).toEqual([
    { id: "open", result: {} },
    { event: "terminal.exit", data: { exitCode: 17 } },
  ]);
});

it.each([
  ["truncated record", '{"event":', "incomplete event"],
  ["malformed record", "invalid\n", "JSON"],
  ["whitespace record", " \n", "JSON"],
  ["early EOF", "\n", undefined],
])("reports stdout, stderr and exit status for %s", async (_name, stdout, cause) => {
  const failure = await readPayloadProxy(proxy(stdout, "synthetic proxy failure\n", 23), (line) => {
    JSON.parse(line);
    return false;
  }).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toContain("exit code 23");
  expect((failure as Error).message).toContain(`stdout: ${JSON.stringify(stdout)}`);
  expect((failure as Error).message).toContain('stderr: "synthetic proxy failure\\n"');
  expect(String((failure as Error).cause)).toContain(cause ?? "undefined");
});
