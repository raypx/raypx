import { Hono } from "hono";
import { conversationIdSchema } from "@raypx/core/agents";
import { attachmentIdSchema } from "@raypx/core/conversation";
import { SpaceNotFound, spaceIdSchema } from "@raypx/core/spaces";
import type { ApiAppOptions } from "../app/options.js";
import type { ApiRouterEnv } from "../routers/request.js";

/** Attachment content is always a download, including images and active-looking text. */
export function attachmentDownloadHeaders(name: string): Headers {
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return new Headers({
    "content-type": "application/octet-stream",
    "content-disposition": `attachment; filename="download"; filename*=UTF-8''${encoded}`,
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox; default-src 'none'",
    "cache-control": "private, no-store",
    "referrer-policy": "no-referrer",
  });
}
export function createAttachmentDownloadRoutes(
  options: Pick<ApiAppOptions, "spaces" | "messageAttachments" | "readSession" | "rateLimit">,
) {
  const app = new Hono<ApiRouterEnv>();
  app.get("/:spaceId/:conversationId/:id", async (c) => {
    const session = await options.readSession(c.req.raw.headers);
    if (!session) return c.body(null, 401);
    const space = spaceIdSchema.safeParse(c.req.param("spaceId"));
    const conversation = conversationIdSchema.safeParse(c.req.param("conversationId"));
    const id = attachmentIdSchema.safeParse(c.req.param("id"));
    if (!space.success || !conversation.success || !id.success) return c.notFound();
    if (
      options.rateLimit &&
      !(await options.rateLimit(`message-download:${session.user.id}`, { window: 60, max: 60 }))
    )
      return c.body(null, 429);
    try {
      const scope = await options.spaces.resolve(session.user.id, space.data);
      const result = await options.messageAttachments.download(scope, conversation.data, id.data);
      return new Response(Buffer.from(result.bytes, "base64"), {
        headers: attachmentDownloadHeaders(result.attachment.name),
      });
    } catch (error) {
      if (error instanceof SpaceNotFound) return c.notFound();
      throw error;
    }
  });
  return app;
}
