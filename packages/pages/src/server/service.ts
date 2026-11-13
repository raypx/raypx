import {
  MAX_PAGE_BYTES,
  PageError,
  pageBodySchema,
  pageIdSchema,
  pageInputSchema,
} from "@raypx/core/pages";
import type { SpaceScope } from "@raypx/spaces/server";
import type { PageActor, PagesRepository, PagesService } from "./types.js";

export async function pageTokenHash(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function createPagesService(
  repository: PagesRepository,
  options: { now?: () => Date } = {},
): PagesService {
  const now = options.now ?? (() => new Date());
  function member(scope: SpaceScope): PageActor {
    return { kind: "member", accountId: scope.member.accountId };
  }
  function actor(scope: SpaceScope, value?: PageActor) {
    const result = value ?? member(scope);
    if (result.accountId !== scope.member.accountId) throw new PageError("PAGE_NOT_FOUND");
    return result;
  }
  function body(value: string) {
    if (value.length > MAX_PAGE_BYTES || new TextEncoder().encode(value).length > MAX_PAGE_BYTES)
      throw new PageError("PAGE_TOO_LARGE");
    return pageBodySchema.parse(value);
  }
  return {
    list: (scope, input = {}) =>
      repository.list(scope, { ...input, limit: Math.min(100, Math.max(1, input.limit ?? 100)) }),
    get: (scope, id, version) => repository.get(scope, id, version),
    async create(scope, input, author, id) {
      body(input.body);
      return repository.create(
        scope,
        id ?? pageIdSchema.parse(crypto.randomUUID()),
        pageInputSchema.parse(input),
        actor(scope, author),
        now(),
      );
    },
    update: async (scope, id, expected, text, author) =>
      repository.update(scope, id, expected, body(text), actor(scope, author), now()),
    rename: (scope, id, expected, title) =>
      repository.rename(
        scope,
        id,
        expected,
        pageInputSchema.shape.title.parse(title),
        member(scope),
        now(),
      ),
    delete: (scope, id, expected) => repository.delete(scope, id, expected, now()),
    versions: (scope, id, limit = 100) =>
      repository.versions(scope, id, Math.min(100, Math.max(1, limit))),
    restore: (scope, id, expected, version) =>
      repository.restore(scope, id, expected, version, member(scope), now()),
    async createShareLink(scope, id, version = null, expiresAt = null) {
      const createdAt = now();
      const expires = expiresAt === null ? null : new Date(expiresAt);
      if (expires && (!Number.isFinite(expires.getTime()) || expires <= createdAt))
        throw new PageError("PAGE_INVALID_INPUT");
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const link = await repository.createShareLink(
        scope,
        id,
        crypto.randomUUID(),
        await pageTokenHash(token),
        version,
        expires,
        createdAt,
      );
      return { ...link, token };
    },
    shareLinks: (scope, id) => repository.shareLinks(scope, id),
    revokeShareLinks: (scope, id, linkId) => repository.revokeShareLinks(scope, id, linkId, now()),
    async resolveShare(token) {
      if (!/^[a-f0-9]{64}$/.test(token)) return null;
      return repository.resolveShare(await pageTokenHash(token), now());
    },
  };
}
