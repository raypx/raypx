import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TaskWorkspace } from "@raypx/tasks/client";
import type { TaskClient } from "@raypx/client";
import {
  terminalRequestSchema,
  terminalRequestSummarySchema,
  terminalSessionSchema,
  type TerminalDecision,
} from "@raypx/contracts/terminal";

afterEach(() => cleanup());
function fixture() {
  const session = terminalSessionSchema.parse({
    id: crypto.randomUUID(),
    provider: "claude",
    providerSessionId: "external-session",
    projectId: crypto.randomUUID(),
    projectName: "Synthetic project",
    capabilities: {
      permission: true,
      permissionTools: ["Bash"],
      question: false,
      plan: false,
      simultaneousAnswers: false,
      requiresHookTrust: false,
    },
  });
  let request = terminalRequestSchema.parse({
    version: 1,
    id: crypto.randomUUID(),
    sessionId: session.id,
    epoch: crypto.randomUUID(),
    revision: 1,
    provider: "claude",
    invocationId: crypto.randomUUID(),
    kind: "permission",
    title: "Bash",
    encoding: "plain",
    body: '{"command":"printf synthetic"}',
    questions: [],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    status: "pending",
    decision: null,
  });
  const deviceId = crypto.randomUUID();
  const list = vi.fn(async () => ({
    sessions: [{ ...session, deviceId, deviceName: "Test Mac" }],
    requests: [{ ...terminalRequestSummarySchema.parse(request), deviceId }],
  }));
  const get = vi.fn(async () => request);
  const decide = vi.fn(async (input: TerminalDecision) => {
    request = { ...request, revision: 3, status: "delivered", decision: input.decision };
    return request;
  });
  const client = {
    tasks: { list: async () => [] },
    devices: { list: async () => [] },
    approvals: { list: async () => [] },
    observed: { list, get, decide },
    subscribe: () => () => {},
  } as unknown as TaskClient;
  const show = () =>
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <BrowserLanguageProvider>
          <TaskWorkspace client={client} accountId="observed-account" view="approvals" />
        </BrowserLanguageProvider>
      </QueryClientProvider>,
    );
  return {
    show,
    list,
    get,
    decide,
    request,
    setRequest: (value: typeof request) => {
      request = value;
    },
  };
}
it("reviews the real input and retains exactly the same decision receipt after an uncertain delivery", async () => {
  const f = fixture();
  f.decide.mockRejectedValueOnce(new Error("synthetic connection loss"));
  f.show();
  await screen.findByText(/printf synthetic/);
  fireEvent.change(screen.getByLabelText("Reason for denying (optional)"), {
    target: { value: "Keep this project unchanged" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Deny$/ }));
  await screen.findByText("Delivery is unconfirmed. Refresh the status or retry the same answer.");
  expect(screen.queryByRole("button", { name: "Allow once" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry the same answer" }));
  await waitFor(() => expect(f.decide).toHaveBeenCalledTimes(2));
  expect(f.decide.mock.calls[0]?.[0]).toEqual(f.decide.mock.calls[1]?.[0]);
  expect(f.decide.mock.calls[1]?.[0].decision).toEqual({
    type: "deny",
    note: "Keep this project unchanged",
  });
  await waitFor(() => expect(screen.queryByRole("button", { name: "Allow once" })).toBeNull());
});
it("does not approve details whose revision changed after the summary was loaded", async () => {
  const f = fixture();
  f.get.mockImplementation(async () => ({
    ...f.request,
    revision: 2,
    body: '{"command":"changed input"}',
  }));
  f.show();
  await screen.findByText("The request changed. Refresh before answering.");
  expect(screen.queryByRole("button", { name: "Allow once" })).toBeNull();
  expect(f.decide).not.toHaveBeenCalled();
});
