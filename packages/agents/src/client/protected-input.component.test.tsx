import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { protectedInputRequestSchema } from "@raypx/core/protected-input";
import { ProtectedInputs } from "./protected-input.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";
const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
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
it.each(["en", "zh"] as const)(
  "masks and clears one-use input, shows provenance and never renders or caches its value (%s)",
  async (language) => {
    let pending = true;
    let resolve!: (value: typeof request) => void;
    const answer = vi.fn(
      () =>
        new Promise<typeof request>((done) => {
          resolve = done;
        }),
    );
    const port = { pending: vi.fn(async () => (pending ? [request] : [])), answer };
    const view = render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <ProtectedInputs port={port} spaceId={request.spaceId} />
      </BrowserLanguageProvider>,
    );
    const field = await waitFor(() => {
      const input = view.container.querySelector("input");
      expect(input).toBeTruthy();
      return input!;
    });
    expect(field.type).toBe("password");
    expect(view.container.textContent).toContain("webhook");
    const value = crypto.randomUUID();
    fireEvent.change(field, { target: { value } });
    fireEvent.submit(field.closest("form")!);
    expect(field.value).toBe("");
    expect(view.container.innerHTML.includes(value)).toBe(false);
    expect(answer).toHaveBeenCalledWith({
      spaceId: request.spaceId,
      requestId: request.id,
      answer: { decision: "answer", value },
    });
    pending = false;
    resolve({ ...request, state: "answered" });
    await waitFor(() => expect(view.container.querySelector("input")).toBeNull());
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    view.unmount();
  },
);
it("clears on page handoff and declines without sending a value", async () => {
  const port = {
    pending: vi.fn(async () => [request]),
    answer: vi.fn(async () => ({ ...request, state: "declined" as const })),
  };
  const view = render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <ProtectedInputs port={port} spaceId={request.spaceId} />
    </BrowserLanguageProvider>,
  );
  const field = await waitFor(() => {
    const input = view.container.querySelector("input");
    expect(input).toBeTruthy();
    return input!;
  });
  fireEvent.change(field, { target: { value: crypto.randomUUID() } });
  fireEvent(window, new Event("pagehide"));
  expect(field.value).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Decline" }));
  expect(port.answer).toHaveBeenCalledWith({
    spaceId: request.spaceId,
    requestId: request.id,
    answer: { decision: "decline" },
  });
  view.unmount();
});
