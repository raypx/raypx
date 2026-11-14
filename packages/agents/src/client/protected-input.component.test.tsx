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
    expect(view.container.textContent).toContain({ en, zh }[language].agents.origins.webhook);
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

it("keeps both basic credential fields masked and clears both on handoff and submit", async () => {
  const basic = {
    ...request,
    input: { ...request.input, destination: { kind: "http-basic" as const } },
  };
  const answer = vi.fn(async () => ({ ...basic, state: "answered" as const }));
  const view = render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <ProtectedInputs port={{ pending: async () => [basic], answer }} spaceId={request.spaceId} />
    </BrowserLanguageProvider>,
  );
  const username = await screen.findByLabelText("Username");
  const password = screen.getByLabelText("Protected input: Access token");
  for (const field of [username, password]) expect(field).toHaveAttribute("type", "password");
  fireEvent.change(username, { target: { value: "member-one" } });
  fireEvent.change(password, { target: { value: "password-one" } });
  fireEvent(window, new Event("pagehide"));
  expect(username).toHaveValue("");
  expect(password).toHaveValue("");
  fireEvent.change(username, { target: { value: "member-two" } });
  fireEvent.change(password, { target: { value: "password-two" } });
  fireEvent.submit(password.closest("form")!);
  expect(username).toHaveValue("");
  expect(password).toHaveValue("");
  expect(answer).toHaveBeenCalledWith({
    spaceId: request.spaceId,
    requestId: request.id,
    answer: { decision: "answer", value: "member-two:password-two" },
  });
  expect(view.container.innerHTML.includes("password-two")).toBe(false);
});
