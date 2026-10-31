import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { PendingCount } from "@raypx/tasks/client/pending-count";

import { humanRequestSchema } from "@raypx/core/tasks";
import { terminalRequestSummarySchema } from "@raypx/contracts/terminal";
import { createTaskClient } from "../../helpers/client.js";
afterEach(cleanup);
it.each(["managed", "observed", "both"])("keeps known counts when %s fails", async (failure) => {
  const client = createTaskClient({
    approvals: {
      list: vi.fn(async () => {
        if (failure !== "observed") throw new Error("unavailable");
        return [
          humanRequestSchema.parse({
            id: crypto.randomUUID(),
            taskId: crypto.randomUUID(),
            kind: "permission",
            title: "Bash",
            body: "",
            questions: [],
            expiresAt: new Date(Date.now() + 60000).toISOString(),
            status: "pending",
            decision: null,
          }),
        ];
      }),
    },
    observed: {
      list: vi.fn(async () => {
        if (failure !== "managed") throw new Error("unavailable");
        const request = terminalRequestSummarySchema.parse({
          version: 1,
          id: crypto.randomUUID(),
          sessionId: crypto.randomUUID(),
          epoch: crypto.randomUUID(),
          revision: 1,
          provider: "claude",
          invocationId: crypto.randomUUID(),
          kind: "permission",
          title: "Bash",
          encoding: "plain",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          status: "pending",
          decision: null,
        });
        const summary = { ...request, deviceId: crypto.randomUUID() };
        return {
          sessions: [],
          requests: [
            summary,
            { ...summary, id: crypto.randomUUID(), status: "delivered" as const },
          ],
        };
      }),
    },
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BrowserLanguageProvider>
        <PendingCount client={client} accountId="account" />
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
  const badge = await screen.findByLabelText(/Pending approvals count is incomplete/);
  expect(badge.textContent).toBe(failure === "both" ? "?" : "1+");
});
