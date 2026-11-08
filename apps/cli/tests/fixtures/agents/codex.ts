import { appendFileSync } from "node:fs";
import { exitForVersion } from "./version.ts";

type RpcMessage = {
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: { decision?: string };
};

exitForVersion("codex");
appendFileSync("starts", "start\n");
const send = (value: Record<string, unknown>) => process.stdout.write(JSON.stringify(value) + "\n");
let buffer = "";
process.stdin.on("data", (chunk: Buffer) => {
  buffer += chunk.toString();
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    const message = JSON.parse(line) as RpcMessage;
    if (message.method === "initialize") send({ id: message.id, result: {} });
    if (message.method === "thread/start" || message.method === "thread/resume")
      send({ id: message.id, result: { thread: { id: "thread-test" } } });
    if (message.method === "turn/start") {
      send({ id: message.id, result: {} });
      send({
        id: "approval",
        method: "item/commandExecution/requestApproval",
        params: { command: "bun test", reason: "Run tests" },
      });
    }
    if (message.id === "approval") {
      if (message.result?.decision === "accept") {
        send({ method: "item/agentMessage/delta", params: { delta: "Tests passed" } });
        send({ method: "turn/completed", params: { turn: { status: "completed" } } });
      } else {
        send({ method: "turn/completed", params: { turn: { status: "failed" } } });
      }
    }
  }
});
