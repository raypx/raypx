import { appendFileSync } from "node:fs";
import { exitForVersion } from "./version.mjs";

exitForVersion("claude");
let prompt = "";
for await (const chunk of process.stdin) prompt += chunk;
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
