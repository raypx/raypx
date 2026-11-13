import { z } from "zod";
import { agentIdSchema } from "./agents.js";
import { spaceIdSchema } from "./spaces.js";

export const MAX_PAGE_BYTES = 262_144;
export const MAX_PAGES_PER_SPACE = 1_000;
export const pageIdSchema = z.string().min(1).max(128).brand<"PageId">();
export type PageId = z.infer<typeof pageIdSchema>;
export const pageKindSchema = z.enum(["document", "html"]);
/** Match UTF-8 encoding, including replacement of lone surrogates, on every platform. */
function fitsPageBody(text: string): boolean {
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0)!;
    if (point <= 0x7f) bytes += 1;
    else if (point <= 0x7ff) bytes += 2;
    else if (point <= 0xffff) bytes += 3;
    else bytes += 4;
    if (bytes > MAX_PAGE_BYTES) return false;
  }
  return true;
}
export const pageBodySchema = z.string().max(MAX_PAGE_BYTES).refine(fitsPageBody, {
  message: "PAGE_TOO_LARGE",
});
export const pageInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  kind: pageKindSchema,
  body: pageBodySchema,
  agentId: agentIdSchema.nullable().default(null),
});
export type PageInput = z.infer<typeof pageInputSchema>;
export const pageAuthorSchema = z.strictObject({
  kind: z.enum(["member", "run"]),
  accountId: z.string().max(128),
  runId: z.string().max(128).nullable(),
});
export const pageSchema = z.strictObject({
  id: pageIdSchema,
  spaceId: spaceIdSchema,
  agentId: agentIdSchema.nullable(),
  title: z.string().max(200),
  kind: pageKindSchema,
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Page = z.infer<typeof pageSchema>;
export const pageVersionSchema = pageSchema.extend({
  body: pageBodySchema,
  author: pageAuthorSchema,
  reason: z.enum(["created", "updated", "renamed", "restored"]),
});
export type PageVersion = z.infer<typeof pageVersionSchema>;
export const pageShareLinkSchema = z.strictObject({
  id: z.string().min(1).max(128),
  spaceId: spaceIdSchema,
  pageId: pageIdSchema,
  version: z.number().int().positive().nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
});
export type PageShareLink = z.infer<typeof pageShareLinkSchema>;
export class PageError extends Error {
  constructor(
    readonly code:
      | "PAGE_NOT_FOUND"
      | "PAGE_CONFLICT"
      | "PAGE_TOO_LARGE"
      | "PAGE_LIMIT"
      | "PAGE_INVALID_INPUT",
  ) {
    super(code);
    this.name = "PageError";
  }
}
