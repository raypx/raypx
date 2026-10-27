import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { decisionSchema, type AgentProvider } from "@raypx/contracts/tasks";
import { TERMINAL_HOOK_TIMEOUT_SECONDS } from "@raypx/contracts/terminal";
import { hookDecision, parseHookInvocation } from "./protocol";
import { localAddressSchema, localFetch } from "../local-http";

const endpointSchema = z
  .object({
    version: z.literal(1),
    epoch: z.string().uuid(),
    token: z.string().min(64),
  })
  .and(localAddressSchema);
const responseSchema = z.object({
  id: z.string().uuid(),
  epoch: z.string().uuid(),
  decision: decisionSchema,
});

/** Every connection/protocol failure is no decision, never a fabricated allow/deny. */
export async function forwardTerminalHook(
  directory: string,
  provider: AgentProvider,
  input: unknown,
) {
  try {
    const invocation = parseHookInvocation(provider, input);
    if (!invocation || Buffer.byteLength(JSON.stringify(input)) > 256 * 1024) return;
    const endpoint = endpointSchema.parse(
      JSON.parse(readFileSync(join(directory, "terminal-hook.json"), "utf8")),
    );
    const send = (path: string, body: unknown, timeout: number) =>
      localFetch(endpoint, path, {
        signal: AbortSignal.timeout(timeout),
        headers: { authorization: `Bearer ${endpoint.token}`, "content-type": "application/json" },
        ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
      });
    const ready = await send("/ready", undefined, 250);
    if (!ready.ok || ((await ready.json()) as { epoch?: unknown }).epoch !== endpoint.epoch) return;
    const response = await send(
      "/hook",
      { provider, input },
      (TERMINAL_HOOK_TIMEOUT_SECONDS - 5) * 1000,
    );
    if (!response.ok) return;
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.epoch !== endpoint.epoch) return;
    const output = hookDecision(invocation, parsed.data.decision);
    if (output === undefined) return;
    return {
      output,
      async delivered() {
        try {
          await send("/delivered", { id: parsed.data.id, epoch: parsed.data.epoch }, 250);
        } catch {
          /* A lost acknowledgement is uncertain delivery, not a second answer. */
        }
      },
    };
  } catch {
    return;
  }
}
