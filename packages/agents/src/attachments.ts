import type { MessageAttachment, AttachmentDelivery } from "@raypx/core/conversation";
import type { ConversationId } from "@raypx/core/agents";
import type { SpaceScope } from "@raypx/spaces/server";
import type { ExecutionRun } from "./conversations.js";
import type { Message as ModelMessage } from "@raypx/ai";

export class MessageAttachmentError extends Error {
  constructor(readonly code: "ATTACHMENT_INVALID" | "ATTACHMENT_LIMIT" | "ATTACHMENT_EXPIRED") {
    super(code);
    this.name = "MessageAttachmentError";
  }
}
export interface MessageAttachmentsService {
  cleanup(): Promise<void>;
  upload(
    scope: SpaceScope,
    conversationId: ConversationId,
    input: {
      name: string;
      mediaType: MessageAttachment["mediaType"];
      bytes: string;
      uploadId?: string | undefined;
      offset?: number | undefined;
      totalSize?: number | undefined;
      final?: boolean | undefined;
    },
  ): Promise<MessageAttachment>;
  remove(scope: SpaceScope, conversationId: ConversationId, id: string): Promise<{ ok: true }>;
  download(
    scope: SpaceScope,
    conversationId: ConversationId,
    id: string,
  ): Promise<{ attachment: MessageAttachment; bytes: string }>;
  prepare(
    scope: SpaceScope,
    run: ExecutionRun,
    supportsImages: boolean,
    signal: AbortSignal,
    deliver?: (id: string, bytes: string) => Promise<string | null>,
    withheldReason?: AttachmentOutcome["reason"],
  ): Promise<ModelMessage[]>;
}
export type AttachmentOutcome = Omit<AttachmentDelivery, "runId">;
