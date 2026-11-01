import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { exitForVersion } from "./version.mjs";

type RpcMessage = {
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: { decision?: string };
};

exitForVersion("codex");
const send = (value: Record<string, unknown>) => process.stdout.write(JSON.stringify(value) + "\n");
let buffer = "";
let resumed = false;
process.stdin.on("data", (chunk: Buffer) => {
  buffer += chunk.toString();
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    const message = JSON.parse(line) as RpcMessage;
    const params = message.params ?? {};
    if (message.method === "initialize") send({ id: message.id, result: {} });
    if (message.method === "thread/start" || message.method === "thread/resume") {
      resumed = message.method === "thread/resume";
      const threadId = typeof params.threadId === "string" ? params.threadId : "new";
      appendFileSync("sessions", `${message.method}:${threadId}\n`);
      send({ id: message.id, result: { thread: { id: "thread-local-workflow" } } });
    }
    if (message.method === "turn/start") {
      send({ id: message.id, result: {} });
      if (resumed) {
        send({ method: "item/agentMessage/delta", params: { delta: "Follow-up completed" } });
        send({ method: "turn/completed", params: { turn: { status: "completed" } } });
      } else {
        send({
          id: "write-report",
          method: "item/commandExecution/requestApproval",
          params: { command: "write report.txt", reason: "Create the approved report" },
        });
      }
    }
    if (message.id === "write-report") {
      if (message.result?.decision === "accept") {
        const seed = readFileSync("seed.txt", "utf8").trim();
        writeFileSync("report.txt", `${seed}\napproved\n`);
        send({
          method: "item/agentMessage/delta",
          params: { delta: `Read ${seed}; wrote report` },
        });
        send({ method: "turn/completed", params: { turn: { status: "completed" } } });
      } else send({ method: "turn/completed", params: { turn: { status: "failed" } } });
    }
  }
});
