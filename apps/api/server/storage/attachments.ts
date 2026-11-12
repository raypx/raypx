import type { Database } from "@raypx/database/connection";
import { sessionAttachment, user } from "@raypx/database/schema";
import { and, count, eq, gt, inArray, sql } from "drizzle-orm";
import {
  MAX_SESSION_ATTACHMENT_CHARACTERS,
  type SessionAttachmentInput,
} from "@raypx/contracts/api";
import type { ControlProjects, ResolveTaskContext } from "@raypx/control";
import { ContextError } from "@raypx/core/memory";
import { taskExecutionPrompt } from "@raypx/core/tasks";
import type { ObjectStorage } from "@raypx/storage";
import { AttachmentError, type SessionAttachments } from "./types.js";

const MAX_ACTIVE_ATTACHMENTS = 64;
const validText = /^(?:[^\p{Cc}]|[\t\r\n])*$/u;
const textDecoder = new TextDecoder("utf-8", { fatal: true });

export function createSessionAttachments(
  db: Database,
  storage: () => Promise<ObjectStorage | null>,
  projects: ControlProjects,
): SessionAttachments {
  return {
    async enabled() {
      return (await storage())?.available === true;
    },
    async upload(owner: string, input: SessionAttachmentInput) {
      const bytes = Buffer.from(input.data, "base64");
      let content: string;
      try {
        content = textDecoder.decode(bytes);
      } catch {
        throw new AttachmentError("ATTACHMENT_INVALID");
      }
      if (
        !content.trim() ||
        content.length > MAX_SESSION_ATTACHMENT_CHARACTERS ||
        !validText.test(content)
      )
        throw new AttachmentError("ATTACHMENT_INVALID");
      await projects.validateContextProject(owner, input);
      const bucket = await storage();
      if (!bucket?.available) throw new AttachmentError("STORAGE_UNAVAILABLE");
      const id = crypto.randomUUID();
      const key = `session-attachments/${id}`;
      await db.transaction(async (tx) => {
        // Serialize reservations, never S3 calls. Pending uploads also occupy a slot.
        const [account] = await tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.id, owner))
          .for("update");
        if (!account) throw new AttachmentError("STORAGE_UNAVAILABLE");
        const [active] = await tx
          .select({ count: count() })
          .from(sessionAttachment)
          .where(
            and(eq(sessionAttachment.userId, owner), gt(sessionAttachment.expiresAt, sql`now()`)),
          );
        if (active!.count >= MAX_ACTIVE_ATTACHMENTS) throw new AttachmentError("ATTACHMENT_LIMIT");
        await tx.insert(sessionAttachment).values({
          id,
          userId: owner,
          projectId: input.projectId,
          deviceId: input.deviceId,
          name: input.name,
          content: "",
          expiresAt: sql`now() + interval '30 days'`,
        });
      });
      try {
        await bucket.put(key, bytes, {
          contentType: "application/octet-stream",
          contentDisposition: "attachment",
          cacheControl: "private, no-store",
        });
        const [row] = await db
          .update(sessionAttachment)
          .set({ ready: true, content })
          .where(and(eq(sessionAttachment.id, id), eq(sessionAttachment.userId, owner)))
          .returning({ id: sessionAttachment.id });
        if (!row) throw new AttachmentError("STORAGE_UNAVAILABLE");
      } catch {
        // An uncertain write can leave an object. Its bucket lifecycle also covers failed uploads.
        await db
          .delete(sessionAttachment)
          .where(and(eq(sessionAttachment.id, id), eq(sessionAttachment.ready, false)))
          .catch(() => {});
        throw new AttachmentError("STORAGE_UNAVAILABLE");
      }
      return { id, revision: 1 as const, attachment: input.name };
    },
  };
}

/** The split relay reads the bounded UTF-8 projection without acquiring storage credentials. */
export function withSessionAttachments(
  db: Database,
  resolve: ResolveTaskContext,
): ResolveTaskContext {
  return async (owner, selection, target, prompt) => {
    const uploads = selection.sources.filter((source) => source.attachment !== undefined);
    if (!uploads.length) return resolve(owner, selection, target, prompt);
    const referenceSelection = {
      sources: selection.sources.filter((source) => source.attachment === undefined),
    };
    const [context, stored] = await Promise.all([
      resolve(owner, referenceSelection, target, prompt),
      db
        .select()
        .from(sessionAttachment)
        .where(
          and(
            eq(sessionAttachment.userId, owner),
            eq(sessionAttachment.deviceId, target.deviceId),
            eq(sessionAttachment.projectId, target.projectId),
            eq(sessionAttachment.ready, true),
            gt(sessionAttachment.expiresAt, sql`now()`),
            inArray(
              sessionAttachment.id,
              uploads.map(({ id }) => id),
            ),
          ),
        )
        .catch(() => {
          throw new ContextError("CONTEXT_UNAVAILABLE");
        }),
    ]);
    const sources = selection.sources.map(({ id, revision, attachment }) => {
      if (attachment === undefined) {
        const reference = context.sources.find((entry) => entry.id === id);
        if (!reference) throw new ContextError("CONTEXT_NOT_FOUND");
        return reference;
      }
      const row = stored.find((entry) => entry.id === id && entry.name === attachment);
      if (!row || revision !== 1) throw new ContextError("CONTEXT_NOT_FOUND");
      return {
        id,
        revision,
        kind: "attachment" as const,
        scope: "account" as const,
        name: row.name,
        content: row.content,
        project: target,
      };
    });
    const snapshot = { capturedAt: context.capturedAt, sources };
    try {
      taskExecutionPrompt({ prompt, context: snapshot });
    } catch {
      throw new ContextError("CONTEXT_TOO_LARGE");
    }
    return snapshot;
  };
}
