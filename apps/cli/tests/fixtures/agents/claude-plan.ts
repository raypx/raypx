import { exitForVersion } from "./version.ts";

exitForVersion("claude");
const settingsArgument = process.argv[process.argv.indexOf("--settings") + 1];
if (!settingsArgument) throw new Error("Expected Claude settings argument");
const settings = JSON.parse(settingsArgument) as {
  hooks: { PreToolUse: { hooks: { url: string }[] }[] };
};
const hook = settings.hooks.PreToolUse[0]?.hooks[0];
if (!hook) throw new Error("Expected Claude PreToolUse hook");
const response = await fetch(hook.url, {
  method: "POST",
  headers: {
    Authorization: "Bearer " + process.env.RAYPX_AGENT_HOOK_TOKEN,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    hook_event_name: "PreToolUse",
    tool_name: "ExitPlanMode",
    tool_input: { plan: "x".repeat(129000) },
  }),
});
const decision = (await response.json()) as {
  hookSpecificOutput: { permissionDecision: string };
};
console.log(
  JSON.stringify({
    type: "result",
    is_error: false,
    result: decision.hookSpecificOutput.permissionDecision,
  }),
);
