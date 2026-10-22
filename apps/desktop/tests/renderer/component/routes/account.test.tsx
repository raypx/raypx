/** @vitest-environment jsdom */
import { useSyncExternalStore, type ReactNode } from "react";
import {
  createHashHistory,
  createMemoryHistory,
  createRouter,
  Outlet,
  RouterProvider,
  type RootRouteOptions,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
// Load matcher types without registering against jest-dom's separate Vitest runtime.
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers
import type {} from "@testing-library/jest-dom/vitest";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { AccountProfile } from "@raypx/contracts/api";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@raypx/ui/themes";
import { routeTree } from "../../../../src/routeTree.gen";

expect.extend(matchers);

type SessionSnapshot = {
  data: { user: AccountProfile } | null;
  isPending: boolean;
  error: unknown;
};
const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  session: { data: null, isPending: false, error: null } as SessionSnapshot,
  listeners: new Set<() => void>(),
}));
vi.mock("../../../../src/features/auth/client", () => ({
  webUrl: "https://raypx.example",
  authClient: {
    signIn: { email: mocks.signIn },
    signUp: { email: vi.fn() },
    sendVerificationEmail: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    signOut: mocks.signOut,
    useSession: () => ({
      ...useSyncExternalStore(
        (listener) => {
          mocks.listeners.add(listener);
          return () => mocks.listeners.delete(listener);
        },
        () => mocks.session,
      ),
      refetch: async () => {},
    }),
  },
}));
vi.mock("../../../../src/features/tasks/client", () => ({
  taskClient: { account: { get: mocks.account }, devices: { list: async () => [] } },
}));
// The generated tree imports terminal code, but account tests never mount xterm.
vi.mock("@xterm/xterm", () => ({ Terminal: vi.fn() }));

const ada: AccountProfile = { id: "ada", name: "Ada Lovelace", email: "ada@example.test" };
const grace: AccountProfile = { id: "grace", name: "Grace Hopper", email: "grace@example.test" };
const unauthorized = { code: "UNAUTHORIZED", message: "private session diagnostic" };

function setSession(user: AccountProfile | null, isPending = false) {
  mocks.session = { data: user ? { user } : null, isPending, error: null };
  const listeners = Array.from(mocks.listeners);
  for (const listener of listeners) listener();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const rootOptions = routeTree.options as typeof routeTree.options &
  Pick<RootRouteOptions, "shellComponent">;
const documentShell = rootOptions.shellComponent;
const rootComponent = rootOptions.component;
const histories: ReturnType<typeof createMemoryHistory>[] = [];
beforeAll(() => {
  // Exercise generated routes without mounting the native window shell.
  rootOptions.shellComponent = ({ children }: { children: ReactNode }) => <>{children}</>;
  rootOptions.component = Outlet;
});
afterAll(() => {
  if (documentShell) rootOptions.shellComponent = documentShell;
  else delete rootOptions.shellComponent;
  if (rootComponent) rootOptions.component = rootComponent;
  else delete rootOptions.component;
});
afterEach(() => {
  cleanup();
  for (const history of histories.splice(0)) history.destroy();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.listeners.clear();
  setSession(ada);
  mocks.account.mockResolvedValue(ada);
  mocks.signIn.mockResolvedValue({ data: {}, error: null });
  mocks.signOut.mockResolvedValue({ data: {}, error: null });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
  window.history.replaceState({}, "", "/");
});

function testRouter(
  url = "/account",
  options: { hash?: boolean; isServer?: boolean; isShell?: boolean } = {},
) {
  if (options.hash) window.history.replaceState({}, "", `/#${url}`);
  const history = options.hash
    ? createHashHistory()
    : createMemoryHistory({ initialEntries: [url] });
  histories.push(history);
  return createRouter({
    routeTree,
    history,
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    ...(options.isServer === undefined ? {} : { isServer: options.isServer }),
    ...(options.isShell === undefined ? {} : { isShell: options.isShell }),
  });
}

function mount(router: ReturnType<typeof testRouter>) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ThemeProvider>
        <BrowserLanguageProvider>
          <RouterProvider router={router} />
        </BrowserLanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

async function page(url = "/account", hash = false) {
  const router = testRouter(url, { hash });
  await router.load();
  mount(router);
  return router;
}

describe("Desktop account route", () => {
  it("renders signed-out for an unauthorized API result without a login wall", async () => {
    setSession(null);
    mocks.account.mockRejectedValue(unauthorized);
    const router = await page();
    expect(screen.getByRole("heading", { name: "You’re not signed in" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(unauthorized.message)).toBeNull();
    expect(router.state.location.pathname).toBe("/account");
    expect(mocks.account).toHaveBeenCalledTimes(1);
  });

  it("reads an authenticated profile through hash history with an abort signal", async () => {
    const router = await page("/account", true);
    expect(router.state.location.pathname).toBe("/account");
    expect(screen.getByRole("heading", { name: ada.name })).toBeTruthy();
    expect(screen.getAllByText(ada.email)).toHaveLength(2);
    expect(mocks.account).toHaveBeenCalledTimes(1);
    const [input, options] = mocks.account.mock.calls[0]!;
    expect(input).toEqual({});
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal.aborted).toBe(false);
  });

  it("shows the existing account skeleton until the route loader finishes", async () => {
    const account = deferred<AccountProfile>();
    mocks.account.mockReturnValue(account.promise);
    const router = testRouter();
    const loading = router.load();
    mount(router);
    expect(await screen.findByRole("status", { name: "Loading…" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: ada.name })).toBeNull();
    await act(async () => {
      account.resolve(ada);
      await loading;
    });
    expect(await screen.findByRole("heading", { name: ada.name })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("uses loaded account data while the session subscription initializes without another read", async () => {
    setSession(null, true);
    await page();
    expect(screen.getByRole("heading", { name: ada.name })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    await act(async () => setSession(ada));
    expect(mocks.account).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: ada.name })).toBeTruthy();
  });

  it("shows a safe connection error and reloads through the retry button", async () => {
    mocks.account.mockRejectedValueOnce(new Error("private RPC diagnostic"));
    await page();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to connect. Check your connection and try again.",
    );
    expect(screen.queryByText("private RPC diagnostic")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: ada.name })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.account).toHaveBeenCalledTimes(2);
  });

  it("aborts an account request when navigation leaves the route", async () => {
    let requestSignal: AbortSignal | undefined;
    mocks.account.mockImplementation(
      (_input, { signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          requestSignal = signal;
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    );
    const router = testRouter();
    const loading = router.load();
    mount(router);
    expect(await screen.findByRole("status", { name: "Loading…" })).toBeTruthy();
    await act(async () => {
      await router.navigate({ to: "/settings" });
      await loading;
    });
    expect(requestSignal?.aborted).toBe(true);
    expect(await screen.findByRole("heading", { name: "Make it yours" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reloads after sign-out and renders the API's signed-out result", async () => {
    mocks.signOut.mockImplementation(async () => {
      setSession(null);
      mocks.account.mockRejectedValue(unauthorized);
      return { data: {}, error: null };
    });
    await page();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "You’re not signed in" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: ada.name })).toBeNull();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.account).toHaveBeenCalledTimes(2);
  });

  it.each(["auth", "network"])(
    "retains the account and avoids a loader refresh when sign-out fails (%s)",
    async (failure) => {
      if (failure === "auth")
        mocks.signOut.mockResolvedValue({ error: { code: "private auth diagnostic" } });
      else mocks.signOut.mockRejectedValue(new Error("private network diagnostic"));
      await page();
      fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Unable to connect. Check your connection and try again.",
      );
      expect(screen.getByRole("heading", { name: ada.name })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
      expect(screen.queryByText(/private (auth|network) diagnostic/)).toBeNull();
      expect(mocks.account).toHaveBeenCalledTimes(1);
    },
  );

  it("still synchronizes an external logout when the in-flight sign-out action fails", async () => {
    const signOut = deferred<{ error: { code: string } }>();
    mocks.signOut.mockReturnValue(signOut.promise);
    await page();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
    mocks.account.mockRejectedValue(unauthorized);
    await act(async () => setSession(null));
    expect(mocks.account).toHaveBeenCalledTimes(1);
    await act(async () => signOut.resolve({ error: { code: "private sign-out failure" } }));
    expect(await screen.findByRole("heading", { name: "You’re not signed in" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: ada.name })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(mocks.account).toHaveBeenCalledTimes(2);
  });

  it("hides a previous identity while a session change refreshes the route", async () => {
    const changed = deferred<AccountProfile>();
    await page();
    mocks.account.mockReturnValue(changed.promise);
    await act(async () => setSession(grace));
    expect(await screen.findByRole("status", { name: "Loading…" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: ada.name })).toBeNull();
    expect(screen.queryByText(ada.email)).toBeNull();
    await act(async () => changed.resolve(grace));
    expect(await screen.findByRole("heading", { name: grace.name })).toBeTruthy();
    expect(mocks.account).toHaveBeenCalledTimes(2);
  });

  it("refreshes for an external sign-out and releases the session subscription on navigation", async () => {
    const router = await page();
    mocks.account.mockRejectedValue(unauthorized);
    await act(async () => setSession(null));
    expect(await screen.findByRole("heading", { name: "You’re not signed in" })).toBeTruthy();
    expect(screen.queryByText(ada.email)).toBeNull();
    expect(mocks.account).toHaveBeenCalledTimes(2);
    const accountListeners = new Set(mocks.listeners);
    await act(async () => router.navigate({ to: "/settings" }));
    for (const listener of accountListeners) expect(mocks.listeners.has(listener)).toBe(false);
    await act(async () => setSession(grace));
    expect(mocks.account).toHaveBeenCalledTimes(2);
  });

  it("keeps a previous identity hidden when refreshing for a new session fails", async () => {
    await page();
    mocks.account.mockRejectedValue(new Error("private identity lookup diagnostic"));
    await act(async () => setSession(grace));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to connect. Check your connection and try again.",
    );
    expect(screen.queryByText(ada.email)).toBeNull();
    expect(screen.queryByRole("heading", { name: ada.name })).toBeNull();
    expect(mocks.account).toHaveBeenCalledTimes(2);
  });

  it("does not preload remote account data", async () => {
    const router = await page("/login");
    await router.preloadRoute({ to: "/account" });
    expect(mocks.account).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/login");
  });

  it.each([false, true])(
    "skips remote auth while server-loading account (shell=%s)",
    async (isShell) => {
      const router = testRouter("/account", { isServer: true, isShell });
      await router.load();
      expect(router.state.matches.some((match) => match.routeId === "/account")).toBe(true);
      expect(mocks.account).not.toHaveBeenCalled();
      expect(mocks.listeners.size).toBe(0);
    },
  );

  it("waits for authentication invalidation before navigating to the account route", async () => {
    const router = await page("/login");
    const refresh = deferred<void>();
    const invalidate = vi.spyOn(router, "invalidate").mockReturnValue(refresh.promise);
    const navigate = vi.spyOn(router, "navigate");
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: ada.email },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(navigate).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/login");
    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
    await act(async () => refresh.resolve());
    expect(await screen.findByRole("heading", { name: ada.name })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/account");
    expect(invalidate.mock.invocationCallOrder[0]).toBeLessThan(
      navigate.mock.invocationCallOrder[0]!,
    );
  });
});
