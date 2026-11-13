import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { ComputerFilesController, type ComputerFilesPort } from "../model/computer-files.js";
import { ComputerFiles } from "./computer-files.js";
import type { ComputerDirectory } from "@raypx/core/computers";
import { computerSpaceId, deferred } from "../../tests/support/computer-fixture.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";

const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
const controllers: ComputerFilesController[] = [];
function fixture(language: "en" | "zh" = "en") {
  const listDirectory = vi.fn<ComputerFilesPort["listDirectory"]>(async ({ path }) => ({
    status: "available",
    truncated: path === ".",
    entries:
      path === "."
        ? [
            { path: "folder", kind: "directory" },
            { path: "notes.txt", kind: "file" },
            { path: "picture.bin", kind: "file" },
          ]
        : [{ path: "folder/nested.txt", kind: "file" }],
  }));
  const readFile = vi.fn<ComputerFilesPort["readFile"]>(async ({ path }) => ({
    status: "available",
    bytes: btoa("<script>private text</script>"),
    size: 90_000,
    truncated: true,
    contentType: path === "picture.bin" ? "binary" : "text",
  }));
  const controller = new ComputerFilesController(computerSpaceId, { listDirectory, readFile });
  controllers.push(controller);
  function mount(
    status: Parameters<typeof ComputerFiles>[0]["status"] = "running",
    refreshKey = "",
  ) {
    return render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <ComputerFiles controller={controller} status={status} refreshKey={refreshKey} />
      </BrowserLanguageProvider>,
    );
  }
  return { controller, listDirectory, readFile, mount };
}
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
});

it.each(["en", "zh"] as const)(
  "shows bounded escaped previews, binary state and truncation in %s",
  async (language) => {
    const test = fixture(language);
    const messages = { en, zh }[language].agents.files;
    test.mount();
    await screen.findByRole("tree", { name: messages.workspace });
    expect(screen.getByText(messages.directoryTruncated)).toBeInTheDocument();
    expect(test.listDirectory).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("treeitem", { name: "notes.txt" }));
    const preview = await screen.findByRole("region", { name: messages.preview });
    await within(preview).findByText("<script>private text</script>");
    expect(preview.querySelector("script")).toBeNull();
    expect(within(preview).getByText(messages.previewTruncated)).toBeInTheDocument();
    expect(preview.querySelector("pre")).toHaveClass(
      "whitespace-pre-wrap",
      "wrap-normal",
      "max-w-full",
      "overflow-x-auto",
    );
    fireEvent.click(screen.getByRole("treeitem", { name: "picture.bin" }));
    await within(preview).findByText(messages.binary);
    expect(preview.querySelector("pre")).toBeNull();
  },
);

it("constrains long file names and lets unbroken preview lines scroll inside their own box", async () => {
  const test = fixture();
  const name = `report-${"long-file-name-".repeat(8)}.txt`;
  const line = "x".repeat(4_096);
  test.listDirectory.mockResolvedValue({
    status: "available",
    entries: [{ path: name, kind: "file" }],
    truncated: false,
  });
  test.readFile.mockResolvedValue({
    status: "available",
    bytes: btoa(line),
    size: line.length,
    truncated: false,
    contentType: "text",
  });
  test.mount();
  expect(name.length).toBeGreaterThan(80);
  const file = await screen.findByRole("treeitem", { name });
  fireEvent.click(file);
  const preview = screen.getByRole("region", { name: "File preview" });
  const pre = await within(preview).findByText(line, { selector: "pre" });
  const files = screen.getByRole("region", { name: "Files" });
  const tree = screen.getByRole("tree", { name: "Workspace" });
  const header = within(files).getByRole("heading", { name: "Files" }).parentElement;
  for (const surface of [files, header, tree, file.parentElement, file, preview, pre]) {
    expect(surface).toHaveClass("w-full", "min-w-0", "max-w-full");
  }
  const label = within(file).getByText(name);
  expect(label).toHaveClass("min-w-0", "flex-1", "truncate");
  expect(label).toHaveAttribute("title", name);
  expect(file).toHaveAccessibleName(name);
  const size = within(file).getByText("4,096 bytes");
  expect(size).toHaveClass("shrink-0", "whitespace-nowrap");
  expect(size).not.toHaveClass("truncate");
  expect(size).not.toHaveClass("max-w-24");
  expect(pre).toHaveClass("box-border", "overflow-x-auto", "overflow-y-auto", "wrap-normal");
  expect(pre).not.toHaveClass("overflow-x-clip");
  expect(pre).not.toHaveClass("wrap-anywhere");
  expect(pre.textContent).toBe(line);
});

it("supports arrows, Home and End with one roving keyboard stop", async () => {
  const test = fixture();
  test.mount();
  const root = await screen.findByRole("treeitem", { name: "Workspace" });
  root.focus();
  fireEvent.keyDown(root, { key: "ArrowDown" });
  const folder = screen.getByRole("treeitem", { name: "folder" });
  expect(folder).toHaveFocus();
  fireEvent.keyDown(folder, { key: "ArrowRight" });
  await screen.findByRole("treeitem", { name: "folder/nested.txt" });
  expect(test.listDirectory).toHaveBeenCalledTimes(2);
  fireEvent.keyDown(folder, { key: "ArrowRight" });
  const nested = screen.getByRole("treeitem", { name: "folder/nested.txt" });
  expect(nested).toHaveFocus();
  fireEvent.keyDown(nested, { key: "ArrowLeft" });
  expect(folder).toHaveFocus();
  fireEvent.keyDown(folder, { key: "ArrowLeft" });
  expect(screen.queryByRole("treeitem", { name: "folder/nested.txt" })).not.toBeInTheDocument();
  fireEvent.keyDown(folder, { key: "Home" });
  expect(root).toHaveFocus();
  fireEvent.keyDown(root, { key: "End" });
  expect(screen.getByRole("treeitem", { name: "picture.bin" })).toHaveFocus();
  expect(screen.getAllByRole("treeitem").filter((item) => item.tabIndex === 0)).toHaveLength(1);
});

it.each([
  { status: "stopped", expected: "Stopped" },
  { status: "not-configured", expected: en.agents.files.notConfigured },
] as const)(
  "shows $status explicitly without reading or starting",
  async ({ status, expected }) => {
    const test = fixture();
    test.mount(status);
    const files = screen.getByRole("region", { name: "Files" });
    expect(files).toHaveTextContent(expected);
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
    expect(test.listDirectory).not.toHaveBeenCalled();
    expect(test.readFile).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Refresh files" })).toBeDisabled();
  },
);

it("refreshes on demand and on a completed changing tool while open, then clears previews on unmount", async () => {
  const test = fixture();
  const mounted = test.mount();
  await screen.findByRole("treeitem", { name: "notes.txt" });
  fireEvent.click(screen.getByRole("treeitem", { name: "notes.txt" }));
  await screen.findByText("<script>private text</script>");
  fireEvent.click(screen.getByRole("button", { name: "Refresh files" }));
  await waitFor(() => expect(test.readFile).toHaveBeenCalledTimes(2));
  mounted.rerender(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <ComputerFiles
        controller={test.controller}
        status="running"
        refreshKey="run:write:finished"
      />
    </BrowserLanguageProvider>,
  );
  await waitFor(() => expect(test.readFile).toHaveBeenCalledTimes(3));
  mounted.unmount();
  expect(test.controller.getSnapshot().preview).toBeNull();
});

it("keeps tree focus during a refresh and moves to Workspace if that row disappears", async () => {
  const test = fixture();
  test.mount();
  const file = await screen.findByRole("treeitem", { name: "notes.txt" });
  act(() => file.focus());
  const response = deferred<ComputerDirectory>();
  test.listDirectory.mockReturnValueOnce(response.promise);
  let refreshing: Promise<void> | undefined;
  act(() => {
    refreshing = test.controller.refresh();
  });
  expect(file).toHaveFocus();
  expect(screen.getByRole("tree")).toHaveAttribute("aria-busy", "true");
  await act(async () => {
    response.resolve({ status: "available", entries: [], truncated: false });
    await refreshing;
  });
  expect(screen.getByRole("treeitem", { name: "Workspace" })).toHaveFocus();
});
