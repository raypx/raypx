import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { PendingCount } from "@raypx/tasks/client/pending-count";
import type { TaskClient } from "@raypx/client";
afterEach(cleanup);
it.each(["managed", "observed", "both"])("keeps known counts when %s fails", async (failure) => {
  const client = {
    approvals: {
      list: vi.fn(async () => {
        if (failure !== "observed") throw new Error("unavailable");
        return [{}];
      }),
    },
    observed: {
      list: vi.fn(async () => {
        if (failure !== "managed") throw new Error("unavailable");
        return {
          requests: [
            { status: "pending", expiresAt: new Date(Date.now() + 60000).toISOString() },
            { status: "delivered" },
          ],
        };
      }),
    },
  } as unknown as TaskClient;
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
