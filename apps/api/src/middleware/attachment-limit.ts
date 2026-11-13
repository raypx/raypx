import { bodyLimit } from "hono/body-limit";

export const limitAttachmentBody = bodyLimit({
  maxSize: 48_000,
  onError: (c) =>
    c.json(
      {
        json: {
          defined: false,
          code: "PAYLOAD_TOO_LARGE",
          message: "Attachment exceeds the upload limit",
          data: { error: { code: "ATTACHMENT_INVALID" }, requestId: c.get("requestId") },
        },
      },
      413,
    ),
});
