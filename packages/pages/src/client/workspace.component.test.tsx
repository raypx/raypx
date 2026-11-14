import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { pageIdSchema, type PageVersion } from "@raypx/core/pages";
import { spaceIdSchema, type SpaceEvent } from "@raypx/core/spaces";
import { PagesWorkspace, type PagesWorkspaceProps } from "./workspace.js";
import type { PagesClientPort } from "../model.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";
const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
const page: PageVersion = {
  id: pageIdSchema.parse("page-a"),
  spaceId: spaceIdSchema.parse("space-a"),
  agentId: null,
  title: "Notes",
  kind: "document",
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  body: "First",
  author: { kind: "member", accountId: "member-a", runId: null },
  reason: "created",
};
function fixture() {
  let current = page;
  const port: PagesClientPort = {
    list: vi.fn(async () => [current]),
    get: vi.fn(async () => current),
    create: vi.fn(async () => current),
    update: vi.fn(async (input) => {
      current = { ...current, body: input.body, version: current.version + 1 };
      return current;
    }),
    rename: vi.fn(async (input) => ({ ...current, title: input.title })),
    delete: vi.fn(async () => ({ deleted: true as const })),
    versions: vi.fn(async () => [current, page]),
    restore: vi.fn(async () => {
      current = { ...page, version: 3, reason: "restored" };
      return current;
    }),
    createShareLink: vi.fn(async () => ({
      id: "link",
      spaceId: page.spaceId,
      pageId: page.id,
      version: null,
      createdAt: page.createdAt,
      expiresAt: null,
      revokedAt: null,
      token: "one-time-secret",
    })),
    shareLinks: vi.fn(async () => []),
    revokeShareLink: vi.fn(async () => ({ revoked: 1 })),
    revokeShareLinks: vi.fn(async () => ({ revoked: 1 })),
  };
  return {
    port,
    change: (value: PageVersion) => {
      current = value;
    },
  };
}
function mount(
  port: PagesClientPort,
  language: "en" | "zh" = "en",
  subscribe?: (listener: (event: SpaceEvent) => void) => () => void,
  previewOptions?: Partial<
    Pick<PagesWorkspaceProps, "canEmbedAuthenticatedDocuments" | "onOpenWebPreview">
  >,
) {
  return render(
    <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
      <PagesWorkspace
        spaceId={page.spaceId}
        port={port}
        apiOrigin="https://api.test"
        canEmbedAuthenticatedDocuments
        initialPageId={page.id}
        {...previewOptions}
        {...(subscribe ? { subscribe } : {})}
      />
    </BrowserLanguageProvider>,
  );
}
it.each(["en", "zh"] as const)(
  "renders only the sandboxed backend frame and edits source in %s",
  async (language) => {
    const { port } = fixture();
    mount(port, language);
    const strings = { en, zh }[language].pages;
    await screen.findByRole("heading", { name: page.title });
    const frame = screen.getByTitle(page.title);
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(frame).not.toHaveAttribute("srcdoc");
    expect(frame).toHaveAttribute(
      "src",
      "https://api.test/page-content/member/space-a/page-a?version=1",
    );
    fireEvent.click(screen.getByRole("button", { name: strings.edit }));
    fireEvent.change(screen.getByRole("textbox", { name: strings.source }), {
      target: { value: "Second" },
    });
    fireEvent.click(screen.getByRole("button", { name: strings.save }));
    await waitFor(() =>
      expect(screen.getByTitle(page.title)).toHaveAttribute(
        "src",
        "https://api.test/page-content/member/space-a/page-a?version=2",
      ),
    );
    expect(port.update).toHaveBeenCalledWith({
      spaceId: page.spaceId,
      id: page.id,
      expectedVersion: 1,
      body: "Second",
    });
  },
);
it("keeps a draft after an Agent event and after a save conflict", async () => {
  const { port, change } = fixture();
  let receive: ((event: SpaceEvent) => void) | undefined;
  mount(port, "en", (listener) => {
    receive = listener;
    return () => {
      receive = undefined;
    };
  });
  await screen.findByRole("heading", { name: page.title });
  fireEvent.click(screen.getByRole("button", { name: en.pages.edit }));
  fireEvent.change(screen.getByRole("textbox", { name: en.pages.source }), {
    target: { value: "My draft" },
  });
  change({ ...page, version: 2, body: "Agent edit" });
  receive?.({
    id: 1,
    spaceId: page.spaceId,
    kind: "page.updated",
    payload: { pageId: page.id, version: 2 },
    createdAt: page.updatedAt,
  });
  await screen.findByText(en.pages.newer);
  expect(screen.getByRole("textbox", { name: en.pages.source })).toHaveValue("My draft");
  fireEvent.click(screen.getByRole("button", { name: en.pages.loadLatest }));
  await waitFor(() => expect(screen.queryByText(en.pages.newer)).not.toBeInTheDocument());
  vi.mocked(port.update).mockRejectedValueOnce({ data: { error: { code: "PAGE_CONFLICT" } } });
  fireEvent.click(screen.getByRole("button", { name: en.pages.save }));
  await screen.findByText(en.pages.conflict);
  expect(screen.getByRole("textbox", { name: en.pages.source })).toHaveValue("My draft");
});
it("clears the one-time link on Escape and returns focus to Share", async () => {
  const { port } = fixture();
  mount(port);
  await screen.findByRole("heading", { name: page.title });
  const opener = screen.getByRole("button", { name: en.pages.share });
  opener.focus();
  fireEvent.click(opener);
  fireEvent.click(await screen.findByRole("button", { name: en.pages.createLink }));
  await screen.findByDisplayValue("https://api.test/page-content/public/one-time-secret");
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(opener).toHaveFocus());
  fireEvent.click(opener);
  await screen.findByRole("dialog");
  expect(
    screen.queryByDisplayValue("https://api.test/page-content/public/one-time-secret"),
  ).not.toBeInTheDocument();
});
it("restores a selected version only after confirmation", async () => {
  const { port, change } = fixture();
  change({ ...page, version: 2, body: "Second" });
  mount(port);
  await screen.findByRole("heading", { name: page.title });
  fireEvent.click(screen.getByRole("button", { name: en.pages.history }));
  const history = await screen.findByRole("dialog");
  await waitFor(() =>
    expect(within(history).getAllByRole("button", { name: en.pages.restore })).toHaveLength(2),
  );
  fireEvent.click(within(history).getAllByRole("button", { name: en.pages.restore })[1]!);
  const confirmation = await screen.findByRole("alertdialog");
  expect(port.restore).not.toHaveBeenCalled();
  fireEvent.click(within(confirmation).getByRole("button", { name: en.pages.restore }));
  await waitFor(() =>
    expect(screen.getByTitle(page.title)).toHaveAttribute(
      "src",
      "https://api.test/page-content/member/space-a/page-a?version=3",
    ),
  );
  expect(port.restore).toHaveBeenCalledWith({
    spaceId: page.spaceId,
    id: page.id,
    expectedVersion: 2,
    version: 1,
  });
});
it.each(["rename", "history", "fullScreen"] as const)(
  "one Escape closes %s and restores focus",
  async (action) => {
    const { port } = fixture();
    mount(port);
    await screen.findByRole("heading", { name: page.title });
    const opener = screen.getByRole("button", { name: en.pages[action] });
    opener.focus();
    fireEvent.click(opener);
    const overlay = await screen.findByRole("dialog");
    fireEvent.keyDown(overlay, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  },
);
it("keeps HTML as source and renders only the authenticated document frame", async () => {
  const { port, change } = fixture();
  change({
    ...page,
    kind: "html",
    body: '<h1 id="untrusted-page-node">Private HTML</h1><script>window.testPage = true</script>',
  });
  mount(port);
  await screen.findByRole("heading", { name: page.title });
  expect(document.getElementById("untrusted-page-node")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: en.pages.edit }));
  expect(screen.getByRole("textbox", { name: en.pages.source })).toHaveValue(
    '<h1 id="untrusted-page-node">Private HTML</h1><script>window.testPage = true</script>',
  );
  expect(screen.queryByRole("button", { name: en.pages.preview })).not.toBeInTheDocument();
  expect(document.getElementById("untrusted-page-node")).toBeNull();
});
it("hides a deleted page document after its Space event", async () => {
  const { port } = fixture();
  let receive: ((event: SpaceEvent) => void) | undefined;
  mount(port, "en", (listener) => {
    receive = listener;
    return () => {
      receive = undefined;
    };
  });
  await screen.findByRole("heading", { name: page.title });
  receive?.({
    id: 2,
    spaceId: page.spaceId,
    kind: "page.deleted",
    payload: { pageId: page.id, version: 1 },
    createdAt: page.updatedAt,
  });
  await screen.findByText(en.pages.notFound);
  expect(screen.queryByTitle(page.title)).not.toBeInTheDocument();
});
it("previews a historical version through its sandboxed authenticated document route", async () => {
  const { port, change } = fixture();
  change({ ...page, version: 2, body: "Second" });
  mount(port);
  await screen.findByRole("heading", { name: page.title });
  fireEvent.click(screen.getByRole("button", { name: en.pages.history }));
  const history = await screen.findByRole("dialog");
  fireEvent.click(await within(history).findByRole("button", { name: "Preview · Version 1" }));
  const frame = await within(history).findByTitle("Notes · Version 1");
  expect(frame).toHaveAttribute(
    "src",
    "https://api.test/page-content/member/space-a/page-a?version=1",
  );
  expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  expect(frame).not.toHaveAttribute("srcdoc");
  expect(port.restore).not.toHaveBeenCalled();
});

it("offers a Web handoff when embedding authenticated documents is disabled", async () => {
  const { port, change } = fixture();
  change({ ...page, version: 2, body: "Second" });
  const openWeb = vi.fn();
  mount(port, "en", undefined, {
    canEmbedAuthenticatedDocuments: false,
    onOpenWebPreview: openWeb,
  });
  await screen.findByRole("heading", { name: page.title });
  expect(document.querySelector("iframe")).toBeNull();
  expect(screen.getByText(en.pages.webPreviewRequired)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: en.pages.openInWeb }));
  expect(openWeb).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: en.pages.fullScreen }));
  const fullscreen = await screen.findByRole("dialog");
  expect(within(fullscreen).getByText(en.pages.webPreviewRequired)).toBeVisible();
  expect(document.querySelector("iframe")).toBeNull();
  fireEvent.keyDown(fullscreen, { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: en.pages.history }));
  const history = await screen.findByRole("dialog");
  fireEvent.click(await within(history).findByRole("button", { name: "Preview · Version 1" }));
  expect(within(history).getByText(en.pages.webPreviewRequired)).toBeVisible();
  expect(document.querySelector("iframe")).toBeNull();
  fireEvent.keyDown(history, { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: en.pages.edit }));
  fireEvent.click(screen.getByRole("button", { name: en.pages.preview }));
  const preview = await screen.findByRole("region", { name: en.pages.preview });
  expect(within(preview).getByText("Second")).toBeVisible();
});

it("saves, restores and shares versions with authenticated document embedding disabled", async () => {
  const { port } = fixture();
  mount(port, "en", undefined, {
    canEmbedAuthenticatedDocuments: false,
    onOpenWebPreview: vi.fn(),
  });
  await screen.findByRole("button", { name: en.pages.openInWeb });
  fireEvent.click(screen.getByRole("button", { name: en.pages.edit }));
  fireEvent.change(screen.getByRole("textbox", { name: en.pages.source }), {
    target: { value: "Second" },
  });
  fireEvent.click(screen.getByRole("button", { name: en.pages.save }));
  await screen.findByText("Version 2");
  expect(port.update).toHaveBeenCalledWith({
    spaceId: page.spaceId,
    id: page.id,
    expectedVersion: 1,
    body: "Second",
  });
  expect(document.querySelector("iframe")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: en.pages.history }));
  const history = await screen.findByRole("dialog");
  const restoreButtons = await within(history).findAllByRole("button", { name: en.pages.restore });
  fireEvent.click(restoreButtons[1]!);
  const confirmation = await screen.findByRole("alertdialog");
  fireEvent.click(within(confirmation).getByRole("button", { name: en.pages.restore }));
  await screen.findByText("Version 3");
  expect(port.restore).toHaveBeenCalledWith({
    spaceId: page.spaceId,
    id: page.id,
    expectedVersion: 2,
    version: 1,
  });
  expect(document.querySelector("iframe")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: en.pages.edit }));
  expect(screen.getByRole("textbox", { name: en.pages.source })).toHaveValue("First");
  fireEvent.click(screen.getByRole("button", { name: en.pages.cancel }));
  await waitFor(() => expect(screen.queryByRole("textbox", { name: en.pages.source })).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: en.pages.share }));
  const sharing = await screen.findByRole("dialog");
  fireEvent.click(await within(sharing).findByRole("button", { name: en.pages.createLink }));
  await within(sharing).findByDisplayValue("https://api.test/page-content/public/one-time-secret");
  expect(port.createShareLink).toHaveBeenCalledWith({
    spaceId: page.spaceId,
    id: page.id,
    version: null,
  });
  expect(document.querySelector("iframe")).toBeNull();
});

it.each(["en", "zh"] as const)(
  "shows a deleted Page when opening a stale activity link in %s",
  async (language) => {
    const { port } = fixture();
    vi.mocked(port.list).mockResolvedValue([]);
    vi.mocked(port.get).mockRejectedValue({ code: "PAGE_NOT_FOUND" });
    mount(port, language);
    const strings = { en, zh }[language].pages;
    expect(await screen.findByRole("alert")).toHaveTextContent(strings.notFound);
    expect(screen.queryByTitle(page.title)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: strings.back }));
    expect(await screen.findByText(strings.empty)).toBeVisible();
  },
);
