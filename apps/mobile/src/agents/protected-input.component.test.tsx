import { expect, it, vi } from "vitest";
import { protectedInputRequestSchema } from "@raypx/core/protected-input";
import { ProtectedInputs } from "./protected-input.js";
import {
  changeText,
  findByLabel,
  press,
  renderNative,
  textContent,
  act,
} from "../../tests/native.js";
import { emitAppState } from "../../tests/mocks/react-native.js";
const request = protectedInputRequestSchema.parse({
  id: crypto.randomUUID(),
  spaceId: "space",
  conversationId: "conversation",
  runId: "run",
  memberAccountId: "member",
  toolCallId: "call",
  toolName: "computer_run_command",
  target: ".",
  input: {
    name: "Access token",
    purpose: "Authenticate once",
    destination: { kind: "environment", variable: "TOKEN" },
  },
  untrustedInput: true,
  provenanceKind: "webhook",
  state: "pending",
  createdAt: new Date().toISOString(),
  expiresAt: "2100-01-01T00:00:00.000Z",
  resolvedAt: null,
});
it("uses a native masked input, clears backgrounded values and never renders a secret", async () => {
  const answer = vi.fn(async () => ({ ...request, state: "answered" as const }));
  const port = { pending: vi.fn(async () => [request]), answer };
  const view = await renderNative(
    <ProtectedInputs
      port={port}
      spaceId={request.spaceId}
      conversationId={request.conversationId}
    />,
  );
  const input = findByLabel(view.root, "Protected input: Access token");
  expect(input.props.secureTextEntry).toBe(true);
  expect(textContent(view.root)).toContain("webhook");
  await changeText(input, crypto.randomUUID());
  await act(async () => emitAppState("background"));
  await press(findByLabel(view.root, "Supply once"));
  expect(answer).not.toHaveBeenCalled();
  await act(async () => emitAppState("active"));
  const value = crypto.randomUUID();
  await changeText(input, value);
  expect(textContent(view.root).includes(value)).toBe(false);
  await press(findByLabel(view.root, "Supply once"));
  expect(answer).toHaveBeenCalledWith({
    spaceId: request.spaceId,
    requestId: request.id,
    answer: { decision: "answer", value },
  });
  await view.unmount();
});
