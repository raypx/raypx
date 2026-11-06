import { appendFileSync, realpathSync } from "node:fs";
import { parseHookInvocation } from "../../../src/runtime/terminal/protocol";
import { forwardTerminalHook } from "../../../src/runtime/terminal/hook";

// Test-only recorder. The harness supplies an isolated project and private output.
const provider = process.env.RAYPX_P0_PROVIDER;
const file = process.env.RAYPX_P0_CAPTURE;
const cwd = process.env.RAYPX_P0_PROJECT;
if ((provider !== "claude" && provider !== "codex") || !file || !cwd) process.exit(0);
const raw = await Bun.stdin.text();
if (Buffer.byteLength(raw) > 256 * 1024) process.exit(0);
let value: unknown;
try {
  value = JSON.parse(raw);
} catch {
  process.exit(0);
}
if (
  !value ||
  typeof value !== "object" ||
  !("cwd" in value) ||
  typeof value.cwd !== "string" ||
  realpathSync(value.cwd) !== cwd
)
  process.exit(0);
appendFileSync(
  file,
  JSON.stringify({ input: value, receivedAt: new Date().toISOString() }) + "\n",
  { mode: 0o600 },
);
const invocation = parseHookInvocation(provider, value);
if (!invocation) process.exit(0);
if (process.env.RAYPX_P0_HOST) {
  const result = await forwardTerminalHook(process.env.RAYPX_P0_HOST, provider, value);
  if (result) {
    appendFileSync(
      file,
      JSON.stringify({ output: result.output, sentAt: new Date().toISOString() }) + "\n",
      { mode: 0o600 },
    );
    await new Promise<void>((resolve, reject) =>
      process.stdout.write(JSON.stringify(result.output) + "\n", (error) =>
        error ? reject(error) : resolve(),
      ),
    );
    await result.delivered();
  } else {
    appendFileSync(
      file,
      JSON.stringify({ fallback: true, sentAt: new Date().toISOString() }) + "\n",
      {
        mode: 0o600,
      },
    );
  }
  process.exit(0);
}
