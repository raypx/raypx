import {
  MAX_MESSAGE_ATTACHMENTS,
  MESSAGE_ATTACHMENT_CHUNK_BYTES,
  MAX_MESSAGE_ATTACHMENT_BYTES,
  attachmentMediaTypeSchema,
  attachmentNameSchema,
  type MessageAttachment,
} from "@raypx/core/conversation";
import type { ConversationSelection } from "./port.js";

export interface MessageAttachmentsPort {
  upload(
    this: void,
    input: ConversationSelection & {
      name: string;
      mediaType: MessageAttachment["mediaType"];
      bytes: string;
      uploadId?: string | undefined;
      offset?: number | undefined;
      totalSize?: number | undefined;
      final?: boolean | undefined;
    },
  ): Promise<MessageAttachment>;
  remove(this: void, input: ConversationSelection & { id: string }): Promise<{ ok: true }>;
  download(
    this: void,
    input: ConversationSelection & { id: string },
  ): Promise<{ attachment: MessageAttachment; bytes: string }>;
}
export interface AttachmentDraft {
  key: string;
  name: string;
  state: "uploading" | "ready" | "error";
  attachment?: MessageAttachment;
  error?: "invalid" | "limit" | "upload";
}
export class AttachmentsController {
  private view: readonly AttachmentDraft[] = [];
  private listeners = new Set<() => void>();
  private disposed = false;
  constructor(
    readonly selection: ConversationSelection,
    readonly port: MessageAttachmentsPort,
    private readonly key: () => string = () => crypto.randomUUID(),
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  private update(view: readonly AttachmentDraft[]) {
    if (this.disposed) return;
    this.view = view;
    for (const listener of this.listeners) listener();
  }
  async add(input: { name: string; mediaType: string; size: number; read(): Promise<string> }) {
    if (this.disposed || this.view.length >= MAX_MESSAGE_ATTACHMENTS) return false;
    const key = this.key();
    const name = attachmentNameSchema.safeParse(input.name);
    const mediaType = attachmentMediaTypeSchema.safeParse(input.mediaType);
    let error: AttachmentDraft["error"];
    if (!name.success || !mediaType.success) error = "invalid";
    if (input.size < 1 || input.size > MAX_MESSAGE_ATTACHMENT_BYTES) error = "limit";
    this.update([
      ...this.view,
      {
        key,
        name: input.name.slice(0, 120),
        state: error ? "error" : "uploading",
        ...(error ? { error } : {}),
      },
    ]);
    if (error || !name.success || !mediaType.success) return false;
    let uploaded: MessageAttachment | undefined;
    try {
      const bytes = await input.read();
      const chunkLength = (MESSAGE_ATTACHMENT_CHUNK_BYTES / 3) * 4;
      const padding = bytes.endsWith("==") ? 2 : Number(bytes.endsWith("="));
      const totalSize = (bytes.length / 4) * 3 - padding;
      if (totalSize !== input.size || totalSize < 1 || totalSize > MAX_MESSAGE_ATTACHMENT_BYTES)
        throw new Error("ATTACHMENT_LIMIT");
      for (let start = 0; start < bytes.length; start += chunkLength) {
        uploaded = await this.port.upload({
          ...this.selection,
          name: name.data,
          mediaType: mediaType.data,
          bytes: bytes.slice(start, start + chunkLength),
          ...(bytes.length > chunkLength
            ? {
                totalSize,
                offset: (start / 4) * 3,
                final: start + chunkLength >= bytes.length,
                ...(uploaded ? { uploadId: uploaded.id } : {}),
              }
            : {}),
        });
        if (this.disposed || !this.view.some((item) => item.key === key)) {
          await this.port.remove({ ...this.selection, id: uploaded.id }).catch(() => {});
          return false;
        }
      }
      if (!uploaded) throw new Error("ATTACHMENT_INVALID");
      const attachment = uploaded;
      if (this.disposed || !this.view.some((item) => item.key === key)) {
        await this.port.remove({ ...this.selection, id: attachment.id }).catch(() => {});
        return false;
      }
      this.update(
        this.view.map((item) =>
          item.key === key ? { ...item, state: "ready", attachment } : item,
        ),
      );
      return true;
    } catch {
      if (uploaded) await this.port.remove({ ...this.selection, id: uploaded.id }).catch(() => {});
      this.update(
        this.view.map((item) =>
          item.key === key ? { ...item, state: "error", error: "upload" } : item,
        ),
      );
      return false;
    }
  }
  remove(key: string) {
    const item = this.view.find((entry) => entry.key === key);
    this.update(this.view.filter((entry) => entry.key !== key));
    if (item?.attachment)
      void this.port.remove({ ...this.selection, id: item.attachment.id }).catch(() => {});
  }
  ready() {
    return this.view.every((item) => item.state === "ready");
  }
  ids() {
    return this.view.flatMap((item) => (item.attachment ? [item.attachment.id] : []));
  }
  sent(ids: readonly string[]) {
    this.update(this.view.filter((item) => !item.attachment || !ids.includes(item.attachment.id)));
  }
  dispose() {
    this.disposed = true;
    this.view = [];
    this.listeners.clear();
  }
}
