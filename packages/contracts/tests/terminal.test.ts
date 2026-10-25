import { expect, it } from "vite-plus/test";
import {
  terminalRequestSchema,
  terminalDecisionSchema,
  TERMINAL_DEFAULT_WAIT_SECONDS,
  TERMINAL_MAX_WAIT_SECONDS,
  TERMINAL_HOOK_TIMEOUT_SECONDS,
} from "../src/terminal";

const request = () => ({
  version: 1,
  id: "00000000-0000-4000-8000-000000000001",
  sessionId: "00000000-0000-4000-8000-000000000002",
  epoch: "00000000-0000-4000-8000-000000000003",
  invocationId: "00000000-0000-4000-8000-000000000004",
  revision: 1,
  provider: "codex",
  kind: "permission",
  title: "Bash",
  body: '{"command":"printf test"}',
  encoding: "plain",
  questions: [],
  createdAt: "2026-10-25T00:00:00.000Z",
  expiresAt: "2026-10-25T00:05:00.000Z",
  status: "pending",
  decision: null,
});
it("keeps observed requests separate from managed task IDs and makes plain content explicit", () => {
  const value = terminalRequestSchema.parse(request());
  expect(value).not.toHaveProperty("taskId");
  expect(value.encoding).toBe("plain");
  expect(terminalRequestSchema.safeParse({ ...value, encoding: "ciphertext" }).success).toBe(false);
});
it("requires request revision, epoch and a receipt for decisions", () => {
  const value = request();
  expect(
    terminalDecisionSchema.safeParse({ id: value.id, decision: { type: "allow" } }).success,
  ).toBe(false);
  expect(
    terminalDecisionSchema.parse({
      id: value.id,
      revision: 1,
      epoch: value.epoch,
      receiptId: "00000000-0000-4000-8000-000000000005",
      decision: { type: "allow" },
    }).revision,
  ).toBe(1);
});
it("leaves hook cleanup time after the maximum Away wait", () => {
  expect(TERMINAL_DEFAULT_WAIT_SECONDS).toBe(300);
  expect(TERMINAL_MAX_WAIT_SECONDS).toBe(600);
  expect(TERMINAL_HOOK_TIMEOUT_SECONDS).toBeGreaterThan(TERMINAL_MAX_WAIT_SECONDS);
});
