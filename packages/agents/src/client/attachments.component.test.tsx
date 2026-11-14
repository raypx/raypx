import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { spaceIdSchema } from "@raypx/core/spaces";
import { conversationIdSchema } from "@raypx/core/agents";
import { AttachmentsController } from "../model/attachments.js";
import { AttachmentDrafts, MessageAttachments, useAttachmentFiles } from "./attachments.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";
const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
const selection = {
  spaceId: spaceIdSchema.parse("space"),
  conversationId: conversationIdSchema.parse("conversation"),
};
function Draft({ controller }: { controller: AttachmentsController }) {
  const files = useAttachmentFiles(controller, false);
  return <AttachmentDrafts controller={controller} files={files} disabled={false} />;
}
it("shows upload progress and allows removal without reappearing after the upload completes", async () => {
  let resolve!: (value: string) => void;
  const upload = vi.fn(async () => ({
    id: crypto.randomUUID(),
    name: "notes.txt",
    mediaType: "text/plain" as const,
    size: 1,
    sha256: "0".repeat(64),
    createdAt: new Date().toISOString(),
  }));
  const remove = vi.fn(async () => ({ ok: true as const }));
  const controller = new AttachmentsController(selection, { upload, remove, download: vi.fn() });
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <Draft controller={controller} />
    </BrowserLanguageProvider>,
  );
  let pending!: Promise<boolean>;
  act(() => {
    pending = controller.add({
      name: "notes.txt",
      mediaType: "text/plain",
      size: 1,
      read: () =>
        new Promise((done) => {
          resolve = done;
        }),
    });
  });
  expect(screen.getByText("Uploading…")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Remove notes.txt" }));
  await act(async () => {
    resolve("YQ==");
    await pending;
  });
  expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
  expect(remove).toHaveBeenCalledTimes(1);
  controller.dispose();
});
it("renders filenames and withheld reasons as inert text in English and Chinese", async () => {
  const file = {
    id: crypto.randomUUID(),
    name: "<img onerror=alert(1)>.txt",
    mediaType: "text/plain" as const,
    size: 1,
    sha256: "0".repeat(64),
    createdAt: new Date().toISOString(),
    deliveries: [
      {
        runId: "run" as never,
        state: "withheld" as const,
        path: null,
        reason: "DEVICE_GRANT_REQUIRED" as const,
      },
    ],
  };
  const view = render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <MessageAttachments attachments={[file]} port={undefined} selection={selection} />
    </BrowserLanguageProvider>,
  );
  expect(screen.getByRole("button", { name: `Download ${file.name}` })).toBeDisabled();
  expect(document.querySelector("img")).toBeNull();
  expect(
    screen.getByText("File withheld: a directory grant from its owner is required."),
  ).toBeVisible();
  view.unmount();
  render(
    <BrowserLanguageProvider initialPreference="zh" restorePreference={false}>
      <MessageAttachments attachments={[file]} port={undefined} selection={selection} />
    </BrowserLanguageProvider>,
  );
  await waitFor(() => expect(screen.getByText("文件未提供：需要目录所有者的授权。")).toBeVisible());
});

it("loads an authenticated image thumbnail and releases its URL when leaving history", async () => {
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:review-thumbnail");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const attachment = {
    id: crypto.randomUUID(),
    name: "drawing.png",
    mediaType: "image/png" as const,
    size: 20,
    sha256: "0".repeat(64),
    createdAt: new Date().toISOString(),
  };
  const download = vi.fn(async () => ({ attachment, bytes: "aW1hZ2U=" }));
  const view = render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <MessageAttachments
        attachments={[attachment]}
        selection={selection}
        port={{ download, upload: vi.fn(), remove: vi.fn() }}
      />
    </BrowserLanguageProvider>,
  );
  await waitFor(() =>
    expect(document.querySelector("img")).toHaveAttribute("src", "blob:review-thumbnail"),
  );
  expect(download).toHaveBeenCalledWith({ ...selection, id: attachment.id });
  expect(screen.getByRole("button", { name: "Download drawing.png" })).toBeEnabled();
  view.unmount();
  expect(revoke).toHaveBeenCalledWith("blob:review-thumbnail");
  create.mockRestore();
  revoke.mockRestore();
});
