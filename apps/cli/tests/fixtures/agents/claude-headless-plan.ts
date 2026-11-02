import { appendFileSync, existsSync } from "node:fs";
import { exitForVersion } from "./version";

exitForVersion("claude");
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.includes("\n")) break;
}
const firstLine = input.split("\n")[0];
if (!firstLine) throw new Error("Expected a Claude prompt line");
const prompt = (JSON.parse(firstLine) as { message: { content: string } }).message.content;
const mode = process.argv[process.argv.indexOf("--permission-mode") + 1];
const resume = process.argv.includes("--resume")
  ? process.argv[process.argv.indexOf("--resume") + 1]
  : null;
appendFileSync("starts", JSON.stringify({ mode, resume, prompt }) + "\n");
console.log(JSON.stringify({ type: "system", session_id: "headless-plan-session" }));
console.log(
  JSON.stringify({
    type: "result",
    is_error: false,
    result:
      mode === "plan"
        ? resume
          ? "Revised implementation plan"
          : "Initial implementation plan"
        : "Implemented approved plan",
  }),
);

// A duplicate result may already be queued while the first waits for plan approval.
if (mode === "plan" && !resume && existsSync("duplicate-plan-result"))
  console.log(JSON.stringify({ type: "result", is_error: false, result: "Stale duplicate plan" }));

// The old process may fail while its completed plan is already awaiting a decision.
if (existsSync("malformed-after-result")) console.log("{");
