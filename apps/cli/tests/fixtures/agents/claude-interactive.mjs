import { appendFileSync, existsSync, unlinkSync } from "node:fs";
import { createInterface } from "node:readline";
import { exitForVersion } from "./version.mjs";
exitForVersion("claude");
const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
let turn = 0,
  active = false;
send({ type: "system", session_id: "interactive" });
setInterval(() => {
  if (!active || !existsSync("complete")) return;
  unlinkSync("complete");
  active = false;
  send({
    type: "assistant",
    message: { id: `answer-${turn}`, content: [{ type: "text", text: "**Done**" }] },
  });
  send({
    type: "result",
    result: "**Done**",
    is_error: false,
    usage: { input_tokens: 20, output_tokens: 3 },
  });
}, 10);
for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  appendFileSync("delivered", JSON.stringify(message) + "\n");
  if (message.type === "user") {
    if (active) process.exit(11);
    turn++;
    active = true;
  }
  if (message.type === "control_request") {
    send({
      type: "control_response",
      response: { subtype: "success", request_id: message.request_id, response: {} },
    });
    if (active) {
      active = false;
      send({ type: "result", is_error: true, result: "Interrupted" });
    }
  }
}
