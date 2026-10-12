import {
  CloudDomainError,
  type CloudEntities,
  type CloudEntityKind,
  type CloudQuery,
  type CloudTransaction,
} from "@voidmix/core";
export interface CloudPageInput {
  actorId: string;
  limit?: number;
  cursor?: string;
}
/** The cursor binds to identity, domain and filters; authorization is checked anew by the caller. */
export async function cloudPage<K extends CloudEntityKind>(
  tx: CloudTransaction,
  input: CloudPageInput,
  kind: K,
  query: CloudQuery = {},
): Promise<{ items: CloudEntities[K][]; nextCursor: string | null }> {
  const limit = input.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new CloudDomainError("CLOUD_INVALID_INPUT", "Invalid page size.");
  const key = JSON.stringify([
    kind,
    input.actorId,
    query.scope ?? null,
    query.parentId ?? null,
    query.actorId ?? null,
    query.ownerAccountId ?? null,
    query.roundId ?? null,
    query.status ?? null,
    query.published ?? null,
  ]);
  let before: CloudQuery["before"];
  if (input.cursor) {
    try {
      const value: unknown = JSON.parse(decodeURIComponent(input.cursor));
      if (
        !Array.isArray(value) ||
        value[0] !== 1 ||
        value[1] !== key ||
        typeof value[2] !== "string" ||
        typeof value[3] !== "string" ||
        !value[3] ||
        !Number.isFinite(Date.parse(value[2]))
      )
        throw new Error("Invalid cursor.");
      before = { createdAt: new Date(value[2]), id: value[3] };
    } catch {
      throw new CloudDomainError("CLOUD_INVALID_INPUT", "Invalid pagination cursor.");
    }
  }
  const rows = await tx.list(kind, { ...query, limit: limit + 1, ...(before ? { before } : {}) });
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last
        ? encodeURIComponent(JSON.stringify([1, key, last.createdAt.toISOString(), last.id]))
        : null,
  };
}
