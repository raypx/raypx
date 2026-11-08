import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
const mocks = vi.hoisted(() => ({ overview: vi.fn(), health: vi.fn(), audit: vi.fn() }));
vi.mock("../client", () => ({ administrationClient: mocks }));
vi.mock("../../auth/client", () => ({
  apiUrl: "https://api.example.test",
  authClient: { useSession: () => ({ data: { user: { id: "admin" } } }) },
}));
import { Overview } from "./overview.tsx";
import { AuditLog } from "./audit-log.tsx";
function page(view: ReactNode, locale: "en" | "zh" = "en") {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BrowserLanguageProvider initialPreference={locale} restorePreference={false}>
        {view}
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
}
const entry = {
  id: "00000000-0000-4000-8000-000000000001",
  actorId: "actor",
  targetId: "site",
  action: "configuration.update",
  source: "http",
  requestId: "server-request",
  startedAt: "2026-11-03T00:00:00.000Z",
  completedAt: null,
  outcome: "unknown",
  before: null,
  after: null,
  errorCode: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.overview.mockResolvedValue({
    totalUsers: 3,
    verifiedUsers: 2,
    newUsers: 0,
    timezone: "UTC",
    registrations: [{ day: "2026-11-03", count: 0 }],
  });
  mocks.health.mockResolvedValue({
    observedAt: "2026-11-03T00:00:00.000Z",
    checks: { database: "ok", redis: "not-configured", relay: "unavailable" },
  });
  mocks.audit.mockResolvedValue({
    entries: [entry],
    next: { startedAt: entry.startedAt, id: entry.id },
  });
});
it.each(["en", "zh"] as const)("labels the audit dialog close button in %s", async (locale) => {
  page(<AuditLog />, locale);
  fireEvent.click(
    await screen.findByRole("button", { name: locale === "en" ? "View details" : "查看详情" }),
  );
  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByRole("button", { name: locale === "en" ? "Close" : "关闭" }),
  ).toBeVisible();
});
it("shows real zeroes, independent dependency states, accessible daily data and period selection", async () => {
  page(<Overview />);
  expect(await screen.findByText("Total users")).toBeTruthy();
  expect(screen.getByText("Not configured")).toBeTruthy();
  expect(screen.getByText("Unavailable")).toBeTruthy();
  await userEvent.click(screen.getByRole("combobox", { name: "Period" }));
  await userEvent.click(await screen.findByRole("option", { name: "Last 7 days" }));
  await waitFor(() =>
    expect(mocks.overview).toHaveBeenLastCalledWith({ days: 7 }, expect.anything()),
  );
  fireEvent.click(screen.getByRole("button", { name: "Daily registration data" }));
  expect(await screen.findByRole("table", { name: "Registrations by day" })).toHaveTextContent(
    "2026-11-03",
  );
});
it("does not display fake zeroes when statistics fail and still renders health", async () => {
  mocks.overview.mockRejectedValue(new Error("private diagnostics"));
  page(<Overview />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to connect");
  expect(screen.queryByText("Total users")).toBeNull();
  expect(await screen.findByText("Not configured")).toBeTruthy();
  expect(screen.queryByText("private diagnostics")).toBeNull();
});
it("filters and pages audit entries without exposing arbitrary data and displays unknown outcomes", async () => {
  page(<AuditLog />);
  expect(await screen.findByText("Unconfirmed")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Actor ID"), { target: { value: "actor" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  await waitFor(() =>
    expect(mocks.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({ actorId: "actor", limit: 50 }),
      expect.anything(),
    ),
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  await waitFor(() =>
    expect(mocks.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: { startedAt: entry.startedAt, id: entry.id } }),
      expect.anything(),
    ),
  );
  fireEvent.click(await screen.findByRole("button", { name: "View details" }));
  expect(within(screen.getByRole("dialog")).getByText("server-request")).toBeTruthy();
});
it("uses the displayed UTC days on initial load, apply and refresh while keeping unapplied dates separate", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-04T23:59:59.999Z"));
  try {
    page(<AuditLog />);
    await screen.findByText("Unconfirmed");
    const initial = { limit: 50, from: "2026-10-05T00:00:00.000Z", to: "2026-11-05T00:00:00.000Z" };
    expect(mocks.audit).toHaveBeenLastCalledWith(initial, expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(mocks.audit).toHaveBeenLastCalledWith(initial, expect.anything()));
    fireEvent.change(screen.getByLabelText("From (UTC)"), { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(mocks.audit).toHaveBeenLastCalledWith(initial, expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() =>
      expect(mocks.audit).toHaveBeenLastCalledWith(
        { ...initial, from: "2026-11-01T00:00:00.000Z" },
        expect.anything(),
      ),
    );
  } finally {
    clock.mockRestore();
  }
});
