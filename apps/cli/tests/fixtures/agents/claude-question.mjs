import { exitForVersion } from "./version.mjs";

exitForVersion("claude");
const settings = JSON.parse(process.argv[process.argv.indexOf("--settings") + 1]);
const hook = settings.hooks.PreToolUse[0].hooks[0];
const response = await fetch(hook.url, {
  method: "POST",
  headers: {
    Authorization: "Bearer " + process.env.RAYPX_AGENT_HOOK_TOKEN,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    hook_event_name: "PreToolUse",
    tool_name: "AskUserQuestion",
    tool_input: {
      questions: [
        {
          question: "Which option?",
          options: [{ label: "A", description: "First" }],
          multiSelect: false,
        },
      ],
    },
  }),
});
const decision = await response.json();
console.log(
  JSON.stringify({
    type: "result",
    is_error: false,
    result: decision.hookSpecificOutput.updatedInput.answers["Which option?"],
  }),
);
