import { appendFileSync, existsSync, unlinkSync } from "node:fs";
import { createInterface } from "node:readline";
import { exitForVersion } from "./version.mjs";
exitForVersion("codex");
const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
let turn = 0,
  active = false;
setInterval(() => {
  if (!active || !existsSync("complete")) return;
  unlinkSync("complete");
  active = false;
  send({
    method: "item/agentMessage/delta",
    params: { itemId: `answer-${turn}`, delta: "**Done**" },
  });
  send({
    method: "thread/tokenUsage/updated",
    params: {
      turnId: `turn-${turn}`,
      tokenUsage: {
        total: { inputTokens: 20 * turn, outputTokens: 3 * turn, cachedInputTokens: 5 * turn },
        last: { inputTokens: 20, outputTokens: 3, cachedInputTokens: 5 },
      },
    },
  });
  send({ method: "turn/completed", params: { turn: { id: `turn-${turn}`, status: "completed" } } });
}, 10);
for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  if (message.method === "initialize") send({ id: message.id, result: {} });
  if (["thread/start", "thread/resume"].includes(message.method)) {
    appendFileSync("sessions", JSON.stringify(message) + "\n");
    if (message.method === "thread/resume" && existsSync("resume-failed")) {
      send({ id: message.id, error: { code: -1, message: "Session unavailable" } });
      continue;
    }
    send({
      id: message.id,
      result: {
        thread: {
          id:
            message.method === "thread/resume" && existsSync("resume-new-session")
              ? "replacement"
              : "interactive",
        },
      },
    });
  }
  if (message.method === "turn/start") {
    if (active) process.exit(11);
    turn++;
    active = true;
    appendFileSync("delivered", JSON.stringify(message) + "\n");
    send({ id: message.id, result: { turn: { id: `turn-${turn}` } } });
    send({
      method: "item/started",
      params: { item: { id: `answer-${turn}`, type: "agentMessage", text: "" } },
    });
  }
  if (message.method === "turn/steer") {
    appendFileSync("delivered", JSON.stringify(message) + "\n");
    if (existsSync("steer-expired") || existsSync("steer-expired-delayed")) {
      if (!existsSync("steer-expired-delayed")) {
        active = false;
        send({
          method: "turn/completed",
          params: { turn: { id: `turn-${turn}`, status: "completed" } },
        });
      }
      send({
        id: message.id,
        error: { code: -32600, message: "expectedTurnId does not match the active turn" },
      });
      continue;
    }
    send({
      id: message.id,
      ...(active && message.params.expectedTurnId === `turn-${turn}`
        ? { result: { turnId: `turn-${turn}` } }
        : { error: { code: -1 } }),
    });
  }
}
