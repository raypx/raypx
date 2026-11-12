import type { SessionAttachmentInput } from "@raypx/contracts/api";

export interface SessionAttachments {
  enabled(): Promise<boolean>;
  upload(
    owner: string,
    input: SessionAttachmentInput,
  ): Promise<{ id: string; revision: 1; attachment: string }>;
}

export class AttachmentError extends Error {
  constructor(readonly code: "ATTACHMENT_INVALID" | "ATTACHMENT_LIMIT" | "STORAGE_UNAVAILABLE") {
    super(code);
  }
}
