/** @vitest-environment jsdom */
import type { ReactNode } from "react";
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
import type { JobDefinition, LocalEvent, LocalMethod, RootGrant } from "@raypx/contracts/local";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { ThemeProvider } from "@raypx/ui/theme/client";
import { routeTree } from "../../routeTree.gen";

expect.extend(matchers);

const mocks = vi.hoisted(() => ({
  isDesktop: vi.fn<() => boolean>(),
  localRequest: vi.fn<(method: LocalMethod, params: unknown) => Promise<unknown>>(),
  listeners: new Set<(event: LocalEvent) => void>(),
}));
vi.mock("../../lib/desktop", () => ({
  isDesktop: mocks.isDesktop,
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
vi.mock("../../features/auth/client", () => ({
  webUrl: "https://raypx.example",
  apiClient: { account: { get: vi.fn() } },
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
vi.mock("@xterm/xterm", () => ({ Terminal: vi.fn() }));

const grants: RootGrant[] = [
  { id: "work", name: "Work", path: "/work", createdAt: "2026-10-15T00:00:00.000Z" },
];
function job(name = "Nightly scan"): JobDefinition {
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function emit(event: LocalEvent["event"], data: Record<string, unknown> = {}) {
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
  mocks.isDesktop.mockReturnValue(true);
  mocks.localRequest.mockImplementation(async (method) => {
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

function testRouter(
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

function mount(router: ReturnType<typeof testRouter>) {
  return render(
    <ThemeProvider disableScript>
      <BrowserLanguageProvider>
        <RouterProvider router={router} />
      </BrowserLanguageProvider>
    </ThemeProvider>,
  );
}

async function page(url: string) {
  const router = testRouter(url);
  await router.load();
  await act(async () => {
    mount(router);
  });
  return router;
}

describe("Desktop local file routes", () => {
  it.each(["/", "/automations"])(
    "keeps %s usable as a preview without RPC or redirects",
    async (url) => {
      mocks.isDesktop.mockReturnValue(false);
      const router = await page(url);
      expect(router.state.location.pathname).toBe(url);
      expect(screen.getByText("Open the desktop app to use local tools.")).toBeTruthy();
      expect(mocks.localRequest).not.toHaveBeenCalled();
      expect(screen.queryByLabelText("Password")).toBeNull();
    },
  );

  it("loads jobs and roots in parallel through hash history and contains auxiliary roots failures", async () => {
    const jobs = deferred<JobDefinition[]>();
    const roots = deferred<RootGrant[]>();
    mocks.localRequest.mockImplementation((method) => {
      if (method === "jobs.list") return jobs.promise;
      if (method === "roots.list") return roots.promise;
      throw new Error(`Unexpected local request: ${method}`);
    });
    const router = testRouter("/automations", { hash: true });
    const loading = router.load();
    await waitFor(() => {
      expect(mocks.localRequest).toHaveBeenCalledWith("jobs.list", {});
      expect(mocks.localRequest).toHaveBeenCalledWith("roots.list", {});
    });
    await act(async () => {
      jobs.resolve([job()]);
      roots.reject(new Error("private roots diagnostic"));
      await loading;
    });
    mount(router);
    expect(router.state.location.pathname).toBe("/automations");
    expect(screen.getByRole("heading", { name: "Nightly scan" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("private roots diagnostic")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "New automation" }));
    expect(screen.getByLabelText("Folder")).toHaveTextContent("Choose a folder in Files first");
  });

  it("shows pending UI until the initial jobs loader finishes", async () => {
    const jobs = deferred<JobDefinition[]>();
    const roots = deferred<RootGrant[]>();
    mocks.localRequest.mockImplementation((method) => {
      if (method === "jobs.list") return jobs.promise;
      if (method === "roots.list") return roots.promise;
      throw new Error(`Unexpected local request: ${method}`);
    });
    const router = testRouter("/automations");
    const loading = router.load();
    mount(router);
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Nightly scan" })).toBeNull();
    await act(async () => {
      jobs.resolve([job()]);
      roots.resolve(grants);
      await loading;
    });
    expect(await screen.findByRole("heading", { name: "Nightly scan" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not start native jobs requests while preloading navigation", async () => {
    const router = testRouter("/settings");
    await router.load();
    await router.preloadRoute({ to: "/automations" });
    expect(router.state.location.pathname).toBe("/settings");
    expect(mocks.localRequest).not.toHaveBeenCalled();
  });

  it.each(["/", "/automations"] as const)(
    "refreshes shared roots when re-entering %s and reuses them between local pages",
    async (destination) => {
      const updatedRoots = deferred<RootGrant[]>();
      let authorized = false;
      mocks.localRequest.mockImplementation(async (method) => {
        if (method === "roots.list") return authorized ? updatedRoots.promise : [];
        if (method === "jobs.list") return [];
        if (method === "files.list") return { entries: [], total: 0, offset: 0 };
        throw new Error(`Unexpected local request: ${method}`);
      });
      const router = testRouter("/", { hash: true });
      await router.load();
      await act(async () => {
        mount(router);
      });
      expect(await screen.findByRole("heading", { name: "Start with a folder" })).toBeTruthy();
      const rootReads = () =>
        mocks.localRequest.mock.calls.filter(([method]) => method === "roots.list").length;
      expect(rootReads()).toBe(1);

      await act(async () => router.navigate({ to: "/settings" }));
      authorized = true;
      await act(async () => {
        void router.navigate({ to: destination });
      });
      await waitFor(() => expect(rootReads()).toBe(2));
      expect(mocks.localRequest.mock.calls.some(([method]) => method === "files.list")).toBe(false);
      await act(async () => updatedRoots.resolve(grants));

      if (destination === "/") {
        expect(await screen.findByText("This folder is empty.")).toBeTruthy();
        expect(mocks.localRequest).toHaveBeenCalledWith("files.list", {
          rootId: "work",
          path: "",
          offset: 0,
          limit: 100,
        });
      } else {
        fireEvent.click(await screen.findByRole("button", { name: "New automation" }));
        await waitFor(() => expect(screen.getByLabelText("Folder")).toHaveValue("work"));
      }

      await act(async () => router.navigate({ to: destination === "/" ? "/automations" : "/" }));
      await act(async () => router.navigate({ to: destination }));
      expect(rootReads()).toBe(2);
    },
  );

  it("shows a safe jobs error and recovers through the refresh button without an event", async () => {
    let failed = true;
    mocks.localRequest.mockImplementation(async (method) => {
      if (method === "jobs.list") {
        if (failed) throw new Error("private jobs diagnostic");
        return [job("Recovered automation")];
      }
      if (method === "roots.list") return grants;
      throw new Error(`Unexpected local request: ${method}`);
    });
    const router = await page("/automations");
    expect(router.state.location.pathname).toBe("/automations");
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    expect(screen.queryByText("private jobs diagnostic")).toBeNull();
    expect(screen.getByRole("heading", { name: "Keep things moving" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New automation" }));
    expect(screen.getByLabelText("Folder")).toHaveValue("work");
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("heading", { name: "Recovered automation" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(router.state.location.pathname).toBe("/automations");
  });

  it("keeps job events out of Files requests while engine readiness refreshes its lists", async () => {
    await page("/");
    expect(await screen.findByText("This folder is empty.")).toBeTruthy();
    const reads = (method: LocalMethod) =>
      mocks.localRequest.mock.calls.filter(([called]) => called === method).length;
    const initialRoots = reads("roots.list");
    const initialFiles = reads("files.list");
    await act(async () => emit("job.finished", { id: "job-1" }));
    expect(reads("jobs.list")).toBe(0);
    expect(reads("roots.list")).toBe(initialRoots);
    expect(reads("files.list")).toBe(initialFiles);

    await act(async () => emit("engine.status", { status: "ready" }));
    await waitFor(() => {
      expect(reads("roots.list")).toBe(initialRoots + 1);
      expect(reads("files.list")).toBe(initialFiles + 1);
    });
    expect(reads("jobs.list")).toBe(0);
  });

  it("invalidates jobs for relevant events and cleans listeners when leaving local routes", async () => {
    let jobs = [job("Before event")];
    mocks.localRequest.mockImplementation(async (method) => {
      if (method === "jobs.list") return jobs;
      if (method === "roots.list") return grants;
      throw new Error(`Unexpected local request: ${method}`);
    });
    const router = await page("/automations");
    expect(screen.getByRole("heading", { name: "Before event" })).toBeTruthy();
    expect(mocks.listeners.size).toBeGreaterThan(0);
    const reads = () =>
      mocks.localRequest.mock.calls.filter(([method]) => method === "jobs.list").length;
    const initialReads = reads();
    await act(async () => {
      emit("engine.status", { status: "starting" });
      emit("terminal.output", { id: "terminal-1", data: "YQ==" });
    });
    expect(reads()).toBe(initialReads);

    jobs = [job("After engine ready")];
    await act(async () => emit("engine.status", { status: "ready" }));
    expect(await screen.findByRole("heading", { name: "After engine ready" })).toBeTruthy();
    expect(reads()).toBe(initialReads + 1);
    jobs = [job("After job finished")];
    await act(async () => emit("job.finished", { id: "job-1" }));
    expect(await screen.findByRole("heading", { name: "After job finished" })).toBeTruthy();
    expect(reads()).toBe(initialReads + 2);

    await act(async () => router.navigate({ to: "/settings" }));
    expect(mocks.listeners.size).toBe(0);
    const beforeUnmountedEvent = mocks.localRequest.mock.calls.length;
    await act(async () => emit("job.finished", { id: "job-1" }));
    expect(mocks.localRequest).toHaveBeenCalledTimes(beforeUnmountedEvent);
  });

  it("retains successful rows, form edits and history through a failed refresh and recovers later", async () => {
    let jobs = [job()];
    let failed = false;
    mocks.localRequest.mockImplementation(async (method) => {
      if (method === "jobs.history") return [];
      if (failed) throw new Error("private refresh diagnostic");
      if (method === "jobs.list") return jobs;
      if (method === "roots.list") return grants;
      throw new Error(`Unexpected local request: ${method}`);
    });
    await page("/automations");
    fireEvent.click(screen.getByRole("button", { name: "Run history" }));
    expect(await screen.findByText("No runs yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit: Nightly scan" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Unsaved draft" } });

    failed = true;
    await act(async () => emit("job.finished", { id: "job-1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
    expect(screen.getByRole("heading", { name: "Nightly scan" })).toBeTruthy();
    expect(screen.getByLabelText("Name")).toHaveValue("Unsaved draft");
    expect(screen.getByLabelText("Folder")).toHaveValue("work");
    expect(screen.getByText("No runs yet.")).toBeTruthy();
    expect(screen.queryByText("private refresh diagnostic")).toBeNull();

    failed = false;
    jobs = [job("Updated on server")];
    await act(async () => emit("engine.status", { status: "ready" }));
    expect(await screen.findByRole("heading", { name: "Updated on server" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Name")).toHaveValue("Unsaved draft");
    expect(screen.getByText("No runs yet.")).toBeTruthy();
  });

  it("keeps a late jobs refresh from replacing the route after navigating away", async () => {
    const lateJobs = deferred<JobDefinition[]>();
    let refreshing = false;
    mocks.localRequest.mockImplementation(async (method) => {
      if (method === "jobs.list") return refreshing ? lateJobs.promise : [job()];
      if (method === "roots.list") return grants;
      throw new Error(`Unexpected local request: ${method}`);
    });
    const router = await page("/automations");
    refreshing = true;
    await act(async () => emit("job.finished", { id: "job-1" }));
    await waitFor(() => {
      expect(
        mocks.localRequest.mock.calls.filter(([method]) => method === "jobs.list"),
      ).toHaveLength(2);
    });
    await act(async () => router.navigate({ to: "/settings" }));
    expect(await screen.findByRole("heading", { name: "Make it yours" })).toBeTruthy();
    await act(async () => lateJobs.resolve([job("Late automation")]));
    expect(router.state.location.pathname).toBe("/settings");
    expect(screen.getByRole("heading", { name: "Make it yours" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Late automation" })).toBeNull();
    expect(mocks.listeners.size).toBe(0);
  });

  it("reloads route data after creating, updating and deleting an automation", async () => {
    let jobs: JobDefinition[] = [];
    mocks.localRequest.mockImplementation(async (method) => {
      if (method === "jobs.list") return jobs;
      if (method === "roots.list") return grants;
      if (method === "jobs.create") {
        jobs = [job()];
        return jobs[0];
      }
      if (method === "jobs.update") {
        jobs = [{ ...job(), enabled: false }];
        return jobs[0];
      }
      if (method === "jobs.delete") {
        jobs = [];
        return true;
      }
      throw new Error(`Unexpected local request: ${method}`);
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await page("/automations");
    fireEvent.click(screen.getByRole("button", { name: "New automation" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Nightly scan" } });
    fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "UTC" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form")!);
    expect(await screen.findByRole("heading", { name: "Nightly scan" })).toBeTruthy();
    expect(mocks.localRequest).toHaveBeenCalledWith(
      "jobs.create",
      expect.objectContaining({
        name: "Nightly scan",
        timezone: "UTC",
        action: { type: "directory.scan", rootId: "work", path: "" },
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pause: Nightly scan" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause: Nightly scan" }));
    expect(await screen.findByRole("button", { name: "Enable: Nightly scan" })).toBeTruthy();
    expect(mocks.localRequest).toHaveBeenCalledWith(
      "jobs.update",
      expect.objectContaining({
        id: "job-1",
        enabled: false,
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete: Nightly scan" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete: Nightly scan" }));
    expect(await screen.findByRole("heading", { name: "Nothing scheduled yet" })).toBeTruthy();
    expect(mocks.localRequest).toHaveBeenCalledWith("jobs.delete", { id: "job-1" });
    expect(mocks.localRequest.mock.calls.filter(([method]) => method === "jobs.list")).toHaveLength(
      4,
    );
  });

  it.each([false, true])(
    "skips native capability and IPC while server-loading local routes (shell=%s)",
    async (isShell) => {
      mocks.isDesktop.mockImplementation(() => {
        throw new Error("Native capability must not run during server loading");
      });
      const router = testRouter("/automations", { isServer: true, isShell });
      await router.load();
      expect(router.state.matches.some((match) => match.routeId === "/_local/automations")).toBe(
        true,
      );
      expect(mocks.isDesktop).not.toHaveBeenCalled();
      expect(mocks.localRequest).not.toHaveBeenCalled();
    },
  );
});
