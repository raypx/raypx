import { expect, it, vi } from "vitest";
import { AttachmentsController } from "@raypx/agents/model";
import { spaceIdSchema } from "@raypx/core/spaces";
import { conversationIdSchema } from "@raypx/core/agents";
import { act, findByLabel, press, renderNative, textContent } from "../../tests/native.js";
import { AttachmentPicker, AttachmentDownloads } from "./attachments.js";
const pickers = vi.hoisted(() => ({
  documents: vi.fn(async () => ({
    canceled: false,
    assets: [{ uri: "cache://document", name: "picked.txt", mimeType: "text/plain", size: 1 }],
  })),
  photos: vi.fn(async () => ({
    canceled: false,
    assets: [{ fileName: "picked.heic", base64: "YQ==", fileSize: 999 }],
  })),
  remove: vi.fn(),
}));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: pickers.documents }));
vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: pickers.photos,
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: "compatible" },
}));
vi.mock("expo-file-system", () => ({
  Paths: { cache: { uri: "cache://" } },
  File: class {
    uri: string;
    size = 1;
    exists = true;
    constructor(uri: string) {
      this.uri = uri;
    }
    async base64() {
      return "YQ==";
    }
    delete() {
      pickers.remove();
    }
  },
}));
const selection = {
  spaceId: spaceIdSchema.parse("space"),
  conversationId: conversationIdSchema.parse("conversation"),
};
const attachment = {
  id: crypto.randomUUID(),
  name: "notes.txt",
  mediaType: "text/plain" as const,
  size: 1,
  sha256: "0".repeat(64),
  createdAt: new Date().toISOString(),
};
it("renders removable native chips, upload errors and the image capability reason", async () => {
  const port = {
    upload: vi.fn(async () => attachment),
    remove: vi.fn(async () => ({ ok: true as const })),
    download: vi.fn(),
  };
  const controller = new AttachmentsController(selection, port);
  await controller.add({
    name: "notes.txt",
    mediaType: "text/plain",
    size: 1,
    read: async () => "YQ==",
  });
  const view = await renderNative(
    <AttachmentPicker controller={controller} supportsImages={false} disabled={false} />,
  );
  expect(findByLabel(view.root, "Attach images").props.isDisabled).toBe(true);
  expect(textContent(view.root)).toContain("This model does not support images");
  await press(findByLabel(view.root, "Remove notes.txt"));
  expect(port.remove).toHaveBeenCalledWith({ ...selection, id: attachment.id });
  await act(async () => {
    await controller.add({
      name: "large.txt",
      mediaType: "text/plain",
      size: 1_048_577,
      read: async () => "",
    });
  });
  expect(textContent(view.root)).toContain("Up to 4 files, 1 MiB each");
  await view.unmount();
  controller.dispose();
});
it("shows device withholding beside downloadable message chips", async () => {
  const view = await renderNative(
    <AttachmentDownloads
      attachments={[
        {
          ...attachment,
          deliveries: [
            {
              runId: "run" as never,
              state: "withheld",
              path: null,
              reason: "DEVICE_GRANT_REQUIRED",
            },
          ],
        },
      ]}
      port={undefined}
      {...selection}
    />,
  );
  expect(findByLabel(view.root, "Download notes.txt").props.isDisabled).toBe(true);
  expect(textContent(view.root)).toContain("a directory grant from its owner is required");
  await view.unmount();
});

it.each([
  ["Attach files", "picked.txt", "text/plain"],
  ["Attach images", "picked.jpg", "image/jpeg"],
] as const)(
  "uploads an explicitly selected native picker file from %s",
  async (label, name, mediaType) => {
    const port = {
      upload: vi.fn(
        async (
          input: Parameters<import("@raypx/agents/model").MessageAttachmentsPort["upload"]>[0],
        ) => ({ ...attachment, name: input.name, mediaType: input.mediaType }),
      ),
      remove: vi.fn(async () => ({ ok: true as const })),
      download: vi.fn(),
    };
    const controller = new AttachmentsController(selection, port);
    const view = await renderNative(
      <AttachmentPicker controller={controller} supportsImages disabled={false} />,
    );
    await press(findByLabel(view.root, label));
    await vi.waitFor(() =>
      expect(port.upload).toHaveBeenCalledWith({ ...selection, name, mediaType, bytes: "YQ==" }),
    );
    expect(controller.getSnapshot()[0]?.state).toBe("ready");
    await view.unmount();
    controller.dispose();
  },
);
