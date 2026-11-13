import { BrowserLanguageProvider } from "../../src/i18n.js";
/** @vitest-environment happy-dom */
import type { ReactNode } from "react";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
  type RootRouteOptions,
} from "@tanstack/react-router";
import { cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";

import { ThemeProvider } from "@raypx/ui/themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SyncDevice } from "@raypx/contracts/tasks";
import { accessForRole, type AccountRole } from "@raypx/account/access";
import { routeTree } from "../../src/routeTree.gen.js";

const mocks = vi.hoisted(() => ({
  role: "member" as AccountRole,
  access: vi.fn(),
  configurationGet: vi.fn(),
  registrationEnabled: true,
  sessionError: false,
  sessionPending: false,
  refetch: vi.fn(),
  session: null as null | {
    user: { id: string; name: string; email: string };
    session: { id: string };
  },
  tasks: vi.fn(async () => []),
  devices: vi.fn(async (): Promise<SyncDevice[]> => []),
  approvals: vi.fn(async () => []),
  create: vi.fn(),
  social: vi.fn(async () => ({ error: null })),
  providers: vi.fn(async () => ({ data: { providers: ["google", "github"] }, error: null })),
  signIn: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  listAccounts: vi.fn(),
  passkeys: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  signOut: vi.fn(),
  loadAccount: vi.fn(),
}));
vi.mock("../../src/features/auth/client.js", () => ({
  webUrl: "https://raypx.example",
  apiUrl: "https://api.raypx.example",
  loadAccount: async () => ({ status: "signed-out" }),
  authClient: {
    useSession: () => ({
      data: mocks.session,
      isPending: mocks.sessionPending,
      error: mocks.sessionError ? new Error("offline") : null,
      refetch: mocks.refetch,
    }),
    getSession: async () => ({
      data: mocks.session,
      error: mocks.sessionError ? { code: "OFFLINE" } : null,
    }),
    $fetch: mocks.providers,
    signIn: { email: mocks.signIn, social: mocks.social },
    signUp: { email: mocks.signUp },
    sendVerificationEmail: mocks.resend,
    listAccounts: mocks.listAccounts,
    passkey: { listUserPasskeys: mocks.passkeys },
    requestPasswordReset: mocks.requestPasswordReset,
    resetPassword: mocks.resetPassword,
    signOut: mocks.signOut,
  },
}));
vi.mock("../../src/features/config/client.js", () => ({
  configurationClient: { get: mocks.configurationGet },
  publicConfigurationQuery: () => ({
    queryKey: ["configuration", "public"],
    queryFn: async () => ({ siteName: "Raypx", registrationEnabled: mocks.registrationEnabled }),
    initialData: { siteName: "Raypx", registrationEnabled: mocks.registrationEnabled },
    staleTime: Infinity,
  }),
}));
vi.mock("../../src/features/auth/access.js", async (original) => ({
  ...(await original<typeof import("../../src/features/auth/access.js")>()),
  accountAccessQuery: (accountId: string | null) => ({
    queryKey: ["account-access", accountId],
    queryFn: mocks.access,
    enabled: Boolean(accountId),
    retry: false,
  }),
}));
vi.mock("../../src/features/tasks/client.js", () => ({
  taskClient: {
    tasks: { list: mocks.tasks, create: mocks.create },
    devices: { list: mocks.devices },
    approvals: { list: mocks.approvals },
    subscribe: () => () => {},
  },
}));
vi.mock("../../src/features/auth/account.js", () => ({
  loadAccount: mocks.loadAccount,
}));
vi.mock("../../src/preferences.js", () => ({
  loadPreferences: () => ({ theme: "light", locale: "en", systemLocales: ["en"] }),
}));

const rootOptions = routeTree.options as typeof routeTree.options &
  Pick<RootRouteOptions, "shellComponent">;
const documentShell = rootOptions.shellComponent;
beforeAll(() => {
  // Component tests mount into happy-dom's existing document; keep the real route tree.
  rootOptions.shellComponent = ({ children }: { children: ReactNode }) => <>{children}</>;
});
afterAll(() => {
  if (documentShell) rootOptions.shellComponent = documentShell;
  else delete rootOptions.shellComponent;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.registrationEnabled = true;
  mocks.sessionError = false;
  mocks.sessionPending = false;
  mocks.session = null;
  mocks.tasks.mockResolvedValue([]);
  mocks.devices.mockResolvedValue([]);
  mocks.approvals.mockResolvedValue([]);
  mocks.passkeys.mockResolvedValue({ data: [], error: null });
  mocks.providers.mockResolvedValue({ data: { providers: ["google", "github"] }, error: null });
  sessionStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
  localStorage.setItem("theme", "system");
  mocks.loadAccount.mockResolvedValue({ status: "signed-out" });
  mocks.role = "member";
  mocks.access
    .mockReset()
    .mockImplementation(async () => accessForRole(mocks.role, mocks.session?.user.id ?? null));
  mocks.configurationGet.mockReset();
});

export async function page(url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [url] }),
    defaultPendingMinMs: 0,
  });
  await router.load();
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserLanguageProvider>
          <RouterProvider router={router} />
        </BrowserLanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return router;
}

export function signIn(role: AccountRole = "member", accountId = "user-1") {
  mocks.role = role;
  mocks.session = {
    user: { id: accountId, name: "Ada", email: "ada@example.test" },
    session: { id: "session-1" },
  };
  mocks.loadAccount.mockResolvedValue({ status: "signed-in", account: mocks.session.user });
}

export { mocks };
