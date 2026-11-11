/** @vitest-environment happy-dom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  createBrowserHistory,
  createMemoryHistory,
  createRouter,
  Outlet,
  RouterProvider,
  type RootRouteOptions,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
import type {
  FileEntry,
  FileListing,
  LocalEvent,
  LocalMethod,
  RootGrant,
} from "@raypx/contracts/local";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { ThemeProvider } from "@raypx/ui/themes";
import { routeTree } from "../../routeTree.gen.js";
import { rememberProject } from "../tasks/project-history.js";

expect.extend(matchers);

const mocks = vi.hoisted(() => ({
  isDesktop: vi.fn<() => boolean>(),
  pickDirectory: vi.fn(),
  localRequest: vi.fn<(method: LocalMethod, params: unknown) => Promise<unknown>>(),
  listeners: new Set<(event: LocalEvent) => void>(),
}));
vi.mock("../../lib/desktop.js", () => ({
  isDesktop: mocks.isDesktop,
  hasTerminalHooks: () => false,
  localRequest: mocks.localRequest,
  onLocalEvent: (listener: (event: LocalEvent) => void) => {
    mocks.listeners.add(listener);
    return () => mocks.listeners.delete(listener);
  },
  getDesktopRuntime: vi.fn(),
  pickDirectory: mocks.pickDirectory,
  restartEngine: vi.fn(),
  saveDesktopPreferences: vi.fn(),
}));
vi.mock("../auth/client.js", () => ({
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
vi.mock("../tasks/client.js", () => ({
  taskClient: { account: { get: vi.fn() } },
}));
vi.mock("@xterm/xterm", () => ({ Terminal: vi.fn() }));

const grants: RootGrant[] = [
  { id: "work", name: "Work", path: "/work", createdAt: "2026-10-15T00:00:00.000Z" },
];
function entry(name: string, kind: FileEntry["kind"] = "file", path = name): FileEntry {
  return { name, path, kind, size: 5, modifiedAt: "2026-10-15T00:00:00.000Z", version: "v1" };
}
function listing(path = "", offset = 0): FileListing {
  return {
    entries: [
      entry("docs", "directory", path ? `${path}/docs` : "docs"),
      entry("readme.txt", "file", path ? `${path}/readme.txt` : "readme.txt"),
    ],
    total: 201,
    offset,
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
  mocks.localRequest.mockImplementation(async (method, params) => {
    if (method.startsWith("instance.")) return { state: "registered" };
    if (method === "jobs.list" || method === "jobs.history") return [];
    if (method === "roots.list") return grants;
    if (method === "files.list") {
      const p = params as { path: string; offset: number };
      return listing(p.path, p.offset);
    }
    if (method === "files.read" || method === "files.write")
      return { text: "hello", version: "v1" };
    throw new Error(`Unexpected local request: ${method}`);
  });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
  window.history.replaceState({}, "", "/");
});

function testRouter(
  url: string,
  options: { browser?: boolean; isServer?: boolean; isShell?: boolean } = {},
) {
  if (options.browser) window.history.replaceState({}, "", url);
  const history = options.browser
    ? createBrowserHistory()
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

async function page(url: string, browser = false) {
  const router = testRouter(url, { browser });
  await router.load();
  await act(async () => {
    mount(router);
  });
  return router;
}

describe("Files route and workspace", () => {
  it("opens the recent authorized directory and keeps a revoked directory explicit", async () => {
    const other = { ...grants[0]!, id: "other", name: "Other", path: "/other" };
    mocks.localRequest.mockImplementation(async (method) => {
      if (method.startsWith("instance.")) return { state: "registered" };
      if (method === "roots.list") return [...grants, other];
      if (method === "files.list") return { entries: [], total: 0, offset: 0 };
      throw new Error(`Unexpected local request: ${method}`);
    });
    rememberProject(other.id);
    const router = await page("/files");
    await screen.findByText("This folder is empty.");
    expect(mocks.localRequest).toHaveBeenCalledWith("files.list", {
      rootId: other.id,
      path: "",
      offset: 0,
      limit: 100,
    });
    mocks.localRequest.mockClear();
    await act(() => router.navigate({ to: "/files", search: { rootId: "revoked" } }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This project is unavailable. Authorize it again; the directory stays the same.",
    );
    expect(router.state.location.search.rootId).toBe("revoked");
    expect(mocks.localRequest.mock.calls.some(([method]) => method === "files.list")).toBe(false);
  });

  async function answerConfirmation(label: "Cancel" | "Discard changes" | "Delete") {
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: label }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  }
  async function draft() {
    fireEvent.click(await screen.findByRole("button", { name: /^readme\.txt$/ }));
    fireEvent.change(await screen.findByLabelText("Text editor"), { target: { value: "draft" } });
  }

  it("focuses opened files, confirms a dirty switch and returns focus to the list", async () => {
    mocks.localRequest.mockImplementation(async (method, params) => {
      if (method.startsWith("instance.")) return { state: "registered" };
      if (method === "roots.list") return grants;
      if (method === "files.list")
        return { entries: [entry("readme.txt"), entry("notes.txt")], total: 2, offset: 0 };
      if (method === "files.read")
        return { text: (params as { path: string }).path, version: "v1" };
      throw new Error(`Unexpected local request: ${method}`);
    });
    await page("/files");
    fireEvent.click(await screen.findByRole("button", { name: /^readme\.txt$/ }));
    const editor = await screen.findByLabelText("Text editor");
    await waitFor(() => expect(editor).toHaveFocus());
    expect(screen.getByRole("button", { name: /^readme\.txt$/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    const selected = screen.getByRole("button", { name: /^readme\.txt$/ });
    selected.focus();
    fireEvent.click(selected);
    await waitFor(() => expect(editor).toHaveFocus());
    fireEvent.change(editor, { target: { value: "draft" } });
    expect(screen.getByText("Unsaved changes")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "notes.txt" }));
    await answerConfirmation("Cancel");
    expect(editor).toHaveValue("draft");
    expect(mocks.localRequest).not.toHaveBeenCalledWith("files.read", {
      rootId: "work",
      path: "notes.txt",
    });
    fireEvent.click(screen.getByRole("button", { name: "notes.txt" }));
    await answerConfirmation("Discard changes");
    await waitFor(() => expect(editor).toHaveValue("notes.txt"));
    await waitFor(() => expect(editor).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Back to files" }));
    await waitFor(() => expect(screen.queryByLabelText("Text editor")).toBeNull());
    expect(screen.getByRole("button", { name: "notes.txt" })).toHaveFocus();
  });

  it("navigates breadcrumb ancestors and the root through the dirty confirmation", async () => {
    const path = "design & notes/设计/attachments";
    const router = await page(`/files?rootId=work&path=${encodeURIComponent(path)}`);
    const initial = router.history.length;
    await draft();
    const breadcrumbs = screen.getByRole("navigation", { name: "Folder path" });
    fireEvent.click(within(breadcrumbs).getByRole("button", { name: "设计" }));
    await answerConfirmation("Cancel");
    expect(router.state.location.search.path).toBe(path);
    expect(screen.getByLabelText("Text editor")).toHaveValue("draft");
    fireEvent.click(within(breadcrumbs).getByRole("button", { name: "设计" }));
    await answerConfirmation("Discard changes");
    await waitFor(() => expect(router.state.location.search.path).toBe("design & notes/设计"));
    await waitFor(() => expect(screen.queryByLabelText("Text editor")).toBeNull());
    expect(mocks.localRequest).toHaveBeenCalledWith(
      "files.list",
      expect.objectContaining({ rootId: "work", path: "design & notes/设计", offset: 0 }),
    );
    fireEvent.click(within(breadcrumbs).getByRole("button", { name: "Work" }));
    await waitFor(() => expect(router.state.location.search.path).toBe(""));
    expect(router.history.length).toBe(initial + 2);
    expect(within(breadcrumbs).queryByRole("button", { name: "Work" })).toBeNull();
    expect(within(breadcrumbs).getByText("Work")).toHaveAttribute("aria-current", "page");
  });

  it.each(["ctrlKey", "metaKey"])(
    "saves with %s+S and clears stale save feedback when editing",
    async (modifier) => {
      mocks.localRequest.mockImplementation(async (method, params) => {
        if (method.startsWith("instance.")) return { state: "registered" };
        if (method === "roots.list") return grants;
        if (method === "files.list") return listing();
        if (method === "files.read") return { text: "hello", version: "v1" };
        if (method === "files.write")
          return { text: (params as { text: string }).text, version: "v2" };
        throw new Error(`Unexpected local request: ${method}`);
      });
      await page("/files");
      await draft();
      const editor = screen.getByLabelText("Text editor");
      fireEvent.keyDown(editor, { key: "s", [modifier]: true });
      expect(await screen.findByText("File saved.")).toBeVisible();
      expect(mocks.localRequest).toHaveBeenCalledWith("files.write", {
        rootId: "work",
        path: "readme.txt",
        text: "draft",
        version: "v1",
      });
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled(),
      );
      fireEvent.change(editor, { target: { value: "next draft" } });
      expect(screen.queryByText("File saved.")).toBeNull();
      expect(screen.getByText("Unsaved changes")).toBeVisible();
      fireEvent.keyDown(editor, { key: "s", [modifier]: true });
      await waitFor(() =>
        expect(mocks.localRequest).toHaveBeenCalledWith("files.write", {
          rootId: "work",
          path: "readme.txt",
          text: "next draft",
          version: "v2",
        }),
      );
    },
  );

  it("keeps save shortcuts scoped to an editable, dirty, idle editor and ignores IME input", async () => {
    const saved = deferred<{ text: string; version: string }>();
    mocks.localRequest.mockImplementation(async (method) => {
      if (method.startsWith("instance.")) return { state: "registered" };
      if (method === "roots.list") return grants;
      if (method === "files.list") return listing();
      if (method === "files.read") return { text: "hello", version: "v1" };
      if (method === "files.write") return saved.promise;
      throw new Error(`Unexpected local request: ${method}`);
    });
    await page("/files");
    fireEvent.click(await screen.findByRole("button", { name: /^readme\.txt$/ }));
    const editor = await screen.findByLabelText("Text editor");
    await waitFor(() => expect(editor).toHaveFocus());
    fireEvent.keyDown(editor, { key: "s", ctrlKey: true });
    expect(
      mocks.localRequest.mock.calls.filter(([method]) => method === "files.write"),
    ).toHaveLength(0);
    fireEvent.change(editor, { target: { value: "draft" } });
    fireEvent.keyDown(screen.getByRole("button", { name: "New folder" }), {
      key: "s",
      ctrlKey: true,
    });
    fireEvent.keyDown(editor, { key: "s", ctrlKey: true, isComposing: true });
    fireEvent.keyDown(editor, { key: "s", ctrlKey: true, keyCode: 229 });
    fireEvent.keyDown(editor, { key: "s", ctrlKey: true, repeat: true });
    fireEvent.keyDown(editor, { key: "s", ctrlKey: true, altKey: true });
    fireEvent.keyDown(editor, { key: "s", ctrlKey: true, shiftKey: true });
    expect(
      mocks.localRequest.mock.calls.filter(([method]) => method === "files.write"),
    ).toHaveLength(0);
    fireEvent.keyDown(editor, { key: "s", ctrlKey: true });
    expect(editor).toBeDisabled();
    fireEvent.keyDown(editor, { key: "s", metaKey: true });
    expect(
      mocks.localRequest.mock.calls.filter(([method]) => method === "files.write"),
    ).toHaveLength(1);
    await act(async () => saved.resolve({ text: "draft", version: "v2" }));
    expect(await screen.findByText("File saved.")).toBeVisible();
  });

  it("reads encoded browser search and normalizes invalid pagination", async () => {
    const router = await page("/files?rootId=work&path=design%20%26%20notes&offset=100", true);
    expect(window.location.pathname).toBe("/files");
    expect(new URLSearchParams(window.location.search).get("path")).toBe("design & notes");
    expect(window.location.hash).toBe("");
    expect(mocks.localRequest).toHaveBeenCalledWith("files.list", {
      rootId: "work",
      path: "design & notes",
      offset: 100,
      limit: 100,
    });
    expect(await screen.findByText("101–200 / 201")).toBeTruthy();
    await act(async () =>
      router.navigate({ to: "/files", search: { rootId: "work", offset: -4 } }),
    );
    expect(mocks.localRequest).toHaveBeenCalledWith(
      "files.list",
      expect.objectContaining({ offset: 0 }),
    );
  });

  it("pushes directories, replaces pages and shares grants with Jobs", async () => {
    const router = await page("/files");
    await screen.findByRole("button", { name: /^docs$/ });
    const initial = router.history.length;
    fireEvent.click(screen.getByRole("button", { name: /^docs$/ }));
    await waitFor(() => expect(router.state.location.search.path).toBe("docs"));
    expect(router.history.length).toBe(initial + 1);
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    await waitFor(() => expect(router.state.location.search.offset).toBe(100));
    expect(router.history.length).toBe(initial + 1);
    await act(async () => router.history.back());
    await waitFor(() => expect(router.state.location.search.path).toBeUndefined());
    await act(async () => router.history.forward());
    await waitFor(() => expect(router.state.location.search.path).toBe("docs"));
    await act(async () => router.navigate({ to: "/automations" }));
    expect(await screen.findByRole("heading", { name: "Automations" })).toBeTruthy();
    expect(mocks.localRequest.mock.calls.filter(([m]) => m === "roots.list")).toHaveLength(1);
  });

  it("retains a dirty editor while the next page is pending without a confirmation", async () => {
    const second = deferred<FileListing>();
    mocks.localRequest.mockImplementation(async (m, p) => {
      if (m === "roots.list") return grants;
      if (m === "files.read") return { text: "hello", version: "v1" };
      const q = p as { offset: number; path: string };
      return q.offset === 100 ? second.promise : listing(q.path, q.offset);
    });
    await page("/files");
    await draft();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(mocks.localRequest).toHaveBeenCalledWith(
        "files.list",
        expect.objectContaining({ offset: 100 }),
      ),
    );
    expect(screen.getByLabelText("Text editor")).toHaveValue("draft");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await act(async () => second.resolve(listing("", 100)));
    expect(await screen.findByText("101–200 / 201")).toBeTruthy();
    expect(screen.getByLabelText("Text editor")).toHaveValue("draft");
  });

  it("confirms once and leaves a cancelled directory navigation unchanged", async () => {
    const router = await page("/files");
    await draft();
    const reads = mocks.localRequest.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /^docs$/ }));
    await answerConfirmation("Cancel");
    expect(router.state.location.search.path).toBeUndefined();
    expect(screen.getByLabelText("Text editor")).toHaveValue("draft");
    expect(mocks.localRequest).toHaveBeenCalledTimes(reads);
    fireEvent.click(screen.getByRole("button", { name: /^docs$/ }));
    await answerConfirmation("Discard changes");
    await waitFor(() => expect(router.state.location.search.path).toBe("docs"));
    await waitFor(() => expect(screen.queryByLabelText("Text editor")).toBeNull());
    await act(async () => router.history.back());
    await screen.findByRole("button", { name: /^readme\.txt$/ });
    expect(screen.queryByLabelText("Text editor")).toBeNull();
  });

  it("keeps the draft on a save conflict and refreshes after a successful write", async () => {
    let conflict = true;
    mocks.localRequest.mockImplementation(async (m, p) => {
      if (m === "roots.list") return grants;
      if (m === "files.read") return { text: "hello", version: "v1" };
      if (m === "files.write") {
        if (conflict) throw new Error("CONFLICT private diagnostic");
        return { text: "draft", version: "v2" };
      }
      return listing("", (p as { offset: number }).offset);
    });
    await page("/files");
    await draft();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This file changed on disk.");
    expect(screen.getByLabelText("Text editor")).toHaveValue("draft");
    expect(screen.queryByText("CONFLICT private diagnostic")).toBeNull();
    conflict = false;
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("File saved.")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled(),
    );
    expect(mocks.localRequest).toHaveBeenCalledWith("files.write", {
      rootId: "work",
      path: "readme.txt",
      text: "draft",
      version: "v1",
    });
  });

  it.each(["v1", "v2"])(
    "preserves a draft across rename and saves with the returned version (opened %s)",
    async (readVersion) => {
      let moved = false;
      mocks.localRequest.mockImplementation(async (method) => {
        if (method === "roots.list") return grants;
        if (method === "files.list")
          return { entries: [entry(moved ? "renamed.txt" : "readme.txt")], total: 1, offset: 0 };
        if (method === "files.read") return { text: "hello", version: readVersion };
        if (method === "files.move") {
          moved = true;
          return { ...entry("renamed.txt"), version: "v3" };
        }
        if (method === "files.write") return { text: "draft", version: "v4" };
        throw new Error(`Unexpected local request: ${method}`);
      });
      await page("/files");
      await draft();
      fireEvent.click(screen.getByRole("button", { name: "Move or rename: readme.txt" }));
      fireEvent.change(screen.getByLabelText("New relative path"), {
        target: { value: "renamed.txt" },
      });
      fireEvent.submit(screen.getByLabelText("New relative path").closest("form")!);
      await waitFor(() => expect(screen.queryByLabelText("New relative path")).toBeNull());
      await waitFor(() => expect(screen.getByLabelText("Text editor")).toBeEnabled());
      expect(mocks.localRequest).toHaveBeenCalledWith("files.move", {
        rootId: "work",
        path: "readme.txt",
        to: "renamed.txt",
        version: readVersion,
      });
      expect(screen.getByLabelText("Text editor")).toHaveValue("draft");
      expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      expect(await screen.findByText("File saved.")).toBeTruthy();
      expect(mocks.localRequest).toHaveBeenCalledWith("files.write", {
        rootId: "work",
        path: "renamed.txt",
        text: "draft",
        version: "v3",
      });
    },
  );

  it("does not rebase an open draft onto a newer directory version during rename", async () => {
    let version = "v1";
    mocks.localRequest.mockImplementation(async (method) => {
      if (method === "roots.list") return grants;
      if (method === "files.list")
        return { entries: [{ ...entry("readme.txt"), version }], total: 1, offset: 0 };
      if (method === "files.read") return { text: "hello", version: "v1" };
      if (method === "files.move") throw new Error("CONFLICT private rename diagnostic");
      throw new Error(`Unexpected local request: ${method}`);
    });
    await page("/files");
    await draft();
    version = "v2";
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.click(await screen.findByRole("button", { name: "Move or rename: readme.txt" }));
    fireEvent.change(screen.getByLabelText("New relative path"), {
      target: { value: "renamed.txt" },
    });
    fireEvent.submit(screen.getByLabelText("New relative path").closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("This file changed on disk.");
    expect(mocks.localRequest).toHaveBeenCalledWith("files.move", {
      rootId: "work",
      path: "readme.txt",
      to: "renamed.txt",
      version: "v1",
    });
    expect(screen.getByLabelText("Text editor")).toHaveValue("draft");
    expect(screen.getByRole("heading", { name: "readme.txt" })).toBeTruthy();
    expect(screen.queryByText("CONFLICT private rename diagnostic")).toBeNull();
  });

  it("ignores a file read and native picker that finish after leaving the workspace", async () => {
    const late = deferred<{ text: string; version: string }>();
    mocks.localRequest.mockImplementation(async (m, p) => {
      if (m === "roots.list") return grants;
      if (m === "files.read") return late.promise;
      return listing("", (p as { offset: number }).offset);
    });
    const router = await page("/files");
    fireEvent.click(await screen.findByRole("button", { name: /^readme\.txt$/ }));
    await act(async () => router.navigate({ to: "/login" }));
    await act(async () => late.resolve({ text: "old content", version: "v1" }));
    expect(router.state.location.pathname).toBe("/login");
    await act(async () => router.navigate({ to: "/files" }));
    expect(screen.queryByLabelText("Text editor")).toBeNull();
    const picked = deferred<RootGrant | null>();
    mocks.pickDirectory.mockReturnValue(picked.promise);
    fireEvent.click(screen.getByRole("button", { name: "Choose folder" }));
    await act(async () => router.navigate({ to: "/login" }));
    await act(async () => picked.resolve(grants[0]!));
    expect(router.state.location.pathname).toBe("/login");
  });

  it("creates a clean store on return and prevents stale list results from replacing a new location", async () => {
    const router = await page("/files");
    await draft();
    let navigation!: Promise<void>;
    act(() => {
      navigation = router.navigate({ to: "/login" });
    });
    await answerConfirmation("Discard changes");
    await act(async () => navigation);
    await act(async () => router.navigate({ to: "/files" }));
    expect(screen.queryByLabelText("Text editor")).toBeNull();
    const old = deferred<FileListing>();
    mocks.localRequest.mockImplementation(async (m, p) => {
      if (m === "roots.list") return grants;
      const q = p as { path: string; offset: number };
      return q.path === "slow" ? old.promise : listing(q.path, q.offset);
    });
    await act(async () =>
      router.navigate({ to: "/files", search: { rootId: "work", path: "slow" } }),
    );
    await act(async () =>
      router.navigate({ to: "/files", search: { rootId: "work", path: "fresh" } }),
    );
    await screen.findByTitle("fresh");
    await act(async () => old.resolve({ entries: [entry("old.txt")], total: 1, offset: 0 }));
    expect(screen.queryByRole("button", { name: "old.txt" })).toBeNull();
    expect(screen.getByTitle("fresh")).toBeTruthy();
  });

  it("updates translations without re-reading native data", async () => {
    await page("/files");
    await screen.findByRole("button", { name: /^readme\.txt$/ });
    const reads = mocks.localRequest.mock.calls.length;
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "raypx_locale",
          newValue: "zh",
          storageArea: localStorage,
        }),
      );
    });
    expect(mocks.localRequest).toHaveBeenCalledTimes(reads);
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });

  it("preserves version and confirmation checks for create, move and delete", async () => {
    mocks.localRequest.mockImplementation(async (method, params) => {
      if (method.startsWith("instance.")) return { state: "registered" };
      if (method === "roots.list") return grants;
      if (method === "files.list") return listing();
      if (method === "files.read" || method === "files.write")
        return { text: "hello", version: "v1" };
      if (["files.mkdir", "files.move", "files.delete"].includes(method)) return {};
      throw new Error(`Unexpected request: ${method} ${String(params)}`);
    });
    await page("/files");
    fireEvent.click(screen.getByRole("button", { name: "New text file" }));
    fireEvent.change(screen.getByLabelText("Relative path"), { target: { value: "new.txt" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByLabelText("Relative path")).toBeNull());
    expect(mocks.localRequest).toHaveBeenCalledWith("files.write", {
      rootId: "work",
      path: "new.txt",
      text: "",
      version: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    fireEvent.change(screen.getByLabelText("Relative path"), { target: { value: "new-folder" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByLabelText("Relative path")).toBeNull());
    expect(mocks.localRequest).toHaveBeenCalledWith("files.mkdir", {
      rootId: "work",
      path: "new-folder",
    });
    fireEvent.click(await screen.findByRole("button", { name: "Move or rename: readme.txt" }));
    fireEvent.change(screen.getByLabelText("New relative path"), {
      target: { value: "renamed.txt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByLabelText("New relative path")).toBeNull());
    expect(mocks.localRequest).toHaveBeenCalledWith("files.move", {
      rootId: "work",
      path: "readme.txt",
      to: "renamed.txt",
      version: "v1",
    });
    fireEvent.click(await screen.findByRole("button", { name: "Delete: readme.txt" }));
    await answerConfirmation("Cancel");
    expect(mocks.localRequest.mock.calls.some(([m]) => m === "files.delete")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete: readme.txt" }));
    await answerConfirmation("Delete");
    await waitFor(() =>
      expect(mocks.localRequest).toHaveBeenCalledWith("files.delete", {
        rootId: "work",
        path: "readme.txt",
        version: "v1",
        confirmed: true,
      }),
    );
  });

  it("keeps a cancelled root selection and retries a list failure without dropping a draft", async () => {
    const other = { ...grants[0]!, id: "other", name: "Other" };
    let failed = false;
    mocks.localRequest.mockImplementation(async (m) => {
      if (m === "roots.list") return [...grants, other];
      if (m === "files.read") return { text: "hello", version: "v1" };
      if (failed) throw new Error("private listing diagnostic");
      return listing();
    });
    const router = await page("/files");
    await draft();
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Folders" }));
    await user.click(screen.getByRole("option", { name: "Other" }));
    await answerConfirmation("Cancel");
    expect(screen.getByRole("combobox")).toHaveTextContent("Work");
    expect(router.state.location.search.rootId).toBeUndefined();
    failed = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("private listing diagnostic")).toBeNull();
    expect(screen.getByLabelText("Text editor")).toHaveValue("draft");
    failed = false;
    fireEvent.click(screen.getAllByRole("button", { name: "Refresh" })[1]!);
    await screen.findByRole("button", { name: /^readme\.txt$/ });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Text editor")).toHaveValue("draft");
  });

  it("does not read native files during preloading or the build shell", async () => {
    const preload = testRouter("/login");
    await preload.load();
    await preload.preloadRoute({ to: "/files" });
    const shell = testRouter("/", { isServer: true, isShell: true });
    await shell.load();
    expect(mocks.localRequest).not.toHaveBeenCalled();
  });
});
