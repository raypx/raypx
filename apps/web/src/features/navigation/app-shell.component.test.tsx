/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { I18nProvider } from "@voidmix/i18n/client";
import { ThemeProvider } from "@voidmix/ui/theme";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { messages } from "../../../tests/fixtures/messages";

const mocks = vi.hoisted(() => ({
  pathname: "/projects",
  navigate: vi.fn(),
  signOut: vi.fn(),
  disposeAccount: vi.fn(),
  cancelQueries: vi.fn(async () => {}),
  clearQueries: vi.fn(),
  clearRoutes: vi.fn(),
  session: {
    data: { user: { id: "account", name: "Ada Lovelace", role: "owner" } } as
      | { user: { id?: string; name: string; role?: string } }
      | undefined,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  Outlet: () => <p>Directory</p>,
  useLocation: () => mocks.pathname,
  useRouterState: () => false,
  useNavigate: () => mocks.navigate,
  useRouter: () => ({
    options: {
      context: {
        resources: { disposeAccount: mocks.disposeAccount },
        queryClient: { cancelQueries: mocks.cancelQueries, clear: mocks.clearQueries },
      },
    },
    clearCache: mocks.clearRoutes,
  }),
}));

vi.mock("../../lib/auth-client", () => ({
  signOut: mocks.signOut,
  useSession: () => mocks.session,
}));

const { AppShell } = await import("./app-shell");

// jsdom ships no matchMedia, and the theme provider resolves "system" through it.
beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderShell() {
  render(
    <I18nProvider locale="en" messages={messages}>
      <ThemeProvider disableScript defaultTheme="system" storageKey={false}>
        <AppShell />
      </ThemeProvider>
    </I18nProvider>,
  );
  return {
    trigger: screen.getAllByRole("button", { name: "Open account menu" })[0]!,
    user: userEvent.setup(),
  };
}

describe.each(["/projects", "/admin"])("account menu at %s", (pathname) => {
  beforeEach(() => {
    mocks.pathname = pathname;
  });
  it("opens the account menu from the sidebar trigger", async () => {
    const { trigger, user } = renderShell();

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.click(trigger);

    const menu = await screen.findByRole("menu");
    expect(menu).toBeVisible();
  });

  it("shows the operator name and role in the menu", async () => {
    const { trigger, user } = renderShell();

    await user.click(trigger);

    const menu = await screen.findByRole("menu");
    expect(menu).toHaveTextContent("Ada Lovelace");
    expect(menu).toHaveTextContent("owner");
  });

  it("offers the three theme choices as a radio group", async () => {
    const { trigger, user } = renderShell();

    await user.click(trigger);
    await screen.findByRole("menu");

    expect(screen.getAllByRole("menuitemradio").map((item) => item.textContent)).toEqual([
      "Light",
      "Dark",
      "System",
    ]);
  });

  it("signs out from the menu, which is the only sign-out control", async () => {
    const { trigger, user } = renderShell();

    // Sign out used to sit beside the trigger as a fourth child of a
    // three-column grid, which wrapped it onto its own row.
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();

    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/" }));
    expect(mocks.disposeAccount).toHaveBeenCalledWith("account");
    expect(mocks.cancelQueries).toHaveBeenCalledOnce();
    expect(mocks.clearQueries).toHaveBeenCalledOnce();
    expect(mocks.clearRoutes).toHaveBeenCalledOnce();
  });

  it("keeps the account block to one child per grid column", () => {
    renderShell();

    const account = screen.getByRole("img", { name: "Ada Lovelace" }).parentElement;
    expect(account).toHaveClass("workbench-account");
    expect(account?.children).toHaveLength(3);
  });
});

it("offers projects to every account and hides administrator navigation from members", () => {
  mocks.session.data = { user: { name: "Member", role: "user" } };
  renderShell();
  expect(screen.getAllByRole("link", { name: "Projects" }).length).toBeGreaterThan(0);
  expect(screen.queryByRole("link", { name: "User management" })).not.toBeInTheDocument();
  expect(screen.queryByText(/Production online|42 ms/)).not.toBeInTheDocument();
  mocks.session.data = { user: { name: "Ada Lovelace", role: "owner" } };
});

it.each(["/projects", "/projects/", "/projects/example", "/admin"])(
  "shares the workbench shell across protected routes: %s",
  (pathname) => {
    mocks.pathname = pathname;
    const { container } = render(
      <I18nProvider locale="en" messages={messages}>
        <ThemeProvider disableScript storageKey={false}>
          <AppShell />
        </ThemeProvider>
      </I18nProvider>,
    );
    expect(container.querySelector(".workbench-shell")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Directory");
  },
);
