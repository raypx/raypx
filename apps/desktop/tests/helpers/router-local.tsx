/** @vitest-environment happy-dom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  createHashHistory,
  createMemoryHistory,
  createRouter,
  Outlet,
  RouterProvider,
  type RootRouteOptions,
} from "@tanstack/react-router";
import { act, cleanup, render } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
// Load matcher types without registering against jest-dom's separate Vitest runtime.
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers
import type {} from "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from "vite-plus/test";
import type { LocalEvent, LocalMethod, RootGrant } from "@raypx/contracts/local";
import type { JobDefinition } from "@raypx/jobs-model";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { ThemeProvider } from "@raypx/ui/themes";
import { routeTree } from "../../src/routeTree.gen.ts";
import { DesktopRuntimeProvider } from "../../src/features/engine/provider.tsx";
import { EngineRouteSync } from "../../src/features/engine/routes.tsx";

expect.extend(matchers);

const mocks = vi.hoisted(() => ({
  isDesktop: vi.fn<() => boolean>(),
  localRequest: vi.fn<(method: LocalMethod, params: unknown) => Promise<unknown>>(),
  listeners: new Set<(event: LocalEvent) => void>(),
}));
vi.mock("../../src/lib/desktop", () => ({
  isDesktop: mocks.isDesktop,
  hasTerminalHooks: () => false,
  localRequest: mocks.localRequest,
  onLocalEvent: (listener: (event: LocalEvent) => void) => {
    mocks.listeners.add(listener);
    return () => mocks.listeners.delete(listener);
  },
  getDesktopRuntime: vi.fn(),
  pickDirectory: vi.fn(),
  restartEngine: vi.fn(),
  saveDesktopPreferences: vi.fn(),
}));
vi.mock("../../src/features/auth/client", () => ({
  apiUrl: "https://api.example.test",
  webUrl: "https://raypx.example",
  authClient: {
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    sendVerificationEmail: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    signOut: vi.fn(),
    useSession: () => ({ data: null, error: null, isPending: false }),
  },
}));
vi.mock("../../src/features/tasks/client", () => ({
  taskClient: { account: { get: vi.fn() } },
}));
vi.mock("@xterm/xterm", () => ({ Terminal: vi.fn() }));

export const grants: RootGrant[] = [
  { id: "work", name: "Work", path: "/work", createdAt: "2026-10-15T00:00:00.000Z" },
];
export function job(name = "Nightly scan"): JobDefinition {
  return {
    id: "job-1",
    name,
    cron: "0 9 * * 1-5",
    timezone: "UTC",
    enabled: true,
    action: { type: "directory.scan", rootId: "work", path: "" },
    createdAt: "2026-10-15T00:00:00.000Z",
    updatedAt: "2026-10-15T00:00:00.000Z",
    nextRuns: [],
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

export function emit(event: LocalEvent["event"], data: Record<string, unknown> = {}) {
  for (const listener of mocks.listeners) listener({ version: 1, event, data });
}

const rootOptions = routeTree.options as typeof routeTree.options &
  Pick<RootRouteOptions, "shellComponent">;
const documentShell = rootOptions.shellComponent;
const rootComponent = rootOptions.component;
const histories: ReturnType<typeof createMemoryHistory>[] = [];
beforeAll(() => {
  // Keep the generated route hierarchy while isolating the native window shell.
  rootOptions.shellComponent = ({ children }: { children: ReactNode }) => <>{children}</>;
  rootOptions.component = () => (
    <DesktopRuntimeProvider>
      <EngineRouteSync />
      <Outlet />
    </DesktopRuntimeProvider>
  );
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
  mocks.isDesktop.mockReturnValue(true);
  mocks.localRequest.mockImplementation(async (method) => {
    if (method.startsWith("instance.")) return { state: "registered" };
    if (method === "jobs.list" || method === "jobs.history") return [];
    if (method === "roots.list") return grants;
    if (method === "files.list") return { entries: [], total: 0, offset: 0 };
    throw new Error(`Unexpected local request: ${method}`);
  });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
  window.history.replaceState({}, "", "/");
});

export function testRouter(
  url: string,
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

export function mount(router: ReturnType<typeof testRouter>) {
  return render(
    <ThemeProvider>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <BrowserLanguageProvider>
          <RouterProvider router={router} />
        </BrowserLanguageProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

export async function page(url: string) {
  const router = testRouter(url);
  await router.load();
  await act(async () => {
    mount(router);
  });
  return router;
}

export { mocks };
