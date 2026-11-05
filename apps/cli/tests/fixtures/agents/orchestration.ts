import { setTimeout as sleep } from "node:timers/promises";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

/**
 * Deterministic orchestration fixture for the characterization goldens.
 *
 * The scenario is the contents of `scenario` in the project directory, so one
 * executable covers every provider-shaped case. `gate` publishes a milestone the
 * host can observe; `release` waits for the test to write `release:<name>`, so no
 * golden depends on a sleep or a scheduler race.
 */
const directory = process.cwd();
// The host launches this fixture as `<provider>`; discovery passes only `--version`,
// so the provider identity comes from the wrapper's file name, not its arguments.
const provider =
  (process.argv[1] ?? "").replace(/\\/g, "/").split("/").pop() === "claude" ? "claude" : "codex";
const send = (value: Record<string, unknown>) => process.stdout.write(`${JSON.stringify(value)}\n`);
const record = (value: unknown) =>
  appendFileSync(`${directory}/delivered`, `${JSON.stringify(value)}\n`);

function gate(name: string) {
  writeFileSync(`${directory}/gate:${name}`, "");
}
async function release(name: string) {
  gate(name);
  while (!existsSync(`${directory}/release:${name}`)) await sleep(5);
}

if (process.argv.includes("--version")) {
  console.log(provider === "codex" ? "codex-cli 0.163.0" : "2.1.302 (Claude Code)");
  process.exit(0);
}
const scenarioFile = readFileSync(`${directory}/scenario`, "utf8").trim();
// An optional second token is an absolute request deadline, so expiry can be
// driven by the host's frozen clock instead of a real-time wait.
const [scenario, deadline] = scenarioFile.split(/\s+/);
record({ kind: "start", provider, scenario });

async function codex() {
  let turn = 0;
  let finishing = false;
  const complete = (status: string, text?: string) => {
    finishing = false;
    if (text)
      send({ method: "item/agentMessage/delta", params: { itemId: `m-${turn}`, delta: text } });
    send({ method: "turn/completed", params: { turn: { id: `gp-turn-${turn}`, status } } });
  };
  for await (const line of createInterface({ input: process.stdin })) {
    const message = JSON.parse(line) as Record<string, unknown>;
    const method = message.method as string | undefined;
    if (method === "initialize") send({ id: message.id, result: {} });
    else if (method === "initialized") continue;
    else if (method === "thread/start" || method === "thread/resume")
      send({ id: message.id, result: { thread: { id: "gp-session" } } });
    else if (method === "turn/start") {
      turn++;
      record({ kind: "turn", turn });
      send({ id: message.id, result: { turn: { id: `gp-turn-${turn}` } } });
      send({ method: "turn/started", params: { turn: { id: `gp-turn-${turn}` } } });
      // Waiting runs in the background so steers and interrupts keep arriving.
      const started = turn;
      void (async () => {
        if (scenario === "codex-approval" && started === 1) {
          await release("approval");
          send({
            id: "gp-approval",
            method: "item/commandExecution/requestApproval",
            params: { command: "bun test", reason: "Run tests" },
          });
        } else if (scenario === "codex-plan" && started === 1) {
          await release("plan");
          if (started === turn) complete("completed", "gp plan");
        } else if (scenario === "codex-question" && started === 1) {
          await release("question");
          send({
            id: "gp-question",
            method: "item/tool/requestUserInput",
            params: {
              questions: [{ id: "0", question: "Pick one", options: [{ label: "A" }] }],
              ...(deadline ? { autoResolutionMs: Date.parse(deadline) - Date.now() } : {}),
            },
          });
        } else {
          // A turn ends when the test releases it, unless a steer already ended it.
          await release("turn");
          if (started === turn && !finishing) complete("completed", "gp done");
        }
      })();
    } else if (method === "turn/steer") {
      record({ kind: "steer" });
      send({ id: message.id, result: { turnId: `gp-turn-${turn}` } });
      finishing = true;
      complete("completed", "gp steered");
    } else if (method === "turn/interrupt") {
      send({ id: message.id, result: {} });
      finishing = true;
      complete("interrupted");
    } else if (message.id === "gp-approval") {
      const decision = (message.result as { decision?: string } | undefined)?.decision;
      record({ kind: "decision", decision });
      complete(
        decision === "accept" ? "completed" : "failed",
        decision === "accept" ? "gp result" : undefined,
      );
    } else if (message.id === "gp-question") {
      record({ kind: "answer" });
      complete("completed", "gp answered");
    }
  }
}

/** Claude approvals arrive on the session-scoped hook endpoint, never on stdin. */
async function claudeApproval(url: string, decision: "allow" | "deny") {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RAYPX_AGENT_HOOK_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: scenario === "claude-plan" ? "ExitPlanMode" : "Bash",
      tool_input:
        scenario === "claude-plan"
          ? { plan: "gp plan" }
          : scenario === "claude-question"
            ? { questions: [{ question: "Pick one", options: [{ label: "A" }] }] }
            : { command: "bun test" },
    }),
  });
  const value = (await response.json()) as {
    hookSpecificOutput: { permissionDecision: string };
  };
  record({
    kind: "hook",
    granted: value.hookSpecificOutput.permissionDecision,
    requested: decision,
  });
}

async function claude() {
  const settings = JSON.parse(process.argv[process.argv.indexOf("--settings") + 1] ?? "{}") as {
    hooks?: { PreToolUse?: { hooks?: { url?: string }[] }[] };
  };
  const url = settings.hooks?.PreToolUse?.[0]?.hooks?.[0]?.url ?? "";
  let turn = 0;
  for await (const line of createInterface({ input: process.stdin })) {
    const message = JSON.parse(line) as Record<string, unknown>;
    if (message.type === "user") {
      turn++;
      record({ kind: "turn", turn });
      send({ type: "system", session_id: "gp-session" });
      void (async () => {
        // The process that resumes an approved plan answers at once; its follow-up
        // turn is the one the test gates and releases.
        if (scenario === "claude-plan" && process.argv.includes("--resume")) {
          send({ type: "result", is_error: false, result: "gp implemented" });
        } else if (scenario === "claude-plan") {
          await release("plan");
          await claudeApproval(url, "allow");
          send({ type: "result", is_error: false, result: "gp plan" });
        } else if (scenario === "claude-question" && turn === 1) {
          await release("question");
          await claudeApproval(url, "allow");
          send({ type: "result", is_error: false, result: "gp answered" });
        } else if (scenario === "claude-approval" && turn === 1) {
          await release("approval");
          await claudeApproval(url, "allow");
          send({ type: "result", is_error: false, result: "gp result" });
        } else {
          await release("turn");
          send({ type: "result", is_error: false, result: "gp done" });
        }
      })();
    } else if (message.type === "control_request") {
      send({
        type: "control_response",
        response: { subtype: "success", request_id: message.request_id, response: {} },
      });
      void (async () => {
        await release("interrupted");
        send({ type: "result", is_error: true, result: "gp interrupted" });
      })();
    }
  }
}

// The process stays alive on stdin; vite-plus/tests may not settle a module's
// top-level await, so the session loop is started without awaiting it here.
void (provider === "codex" ? codex() : claude());
