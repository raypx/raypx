import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  agents,
  conversationCounters,
  conversationRuns,
  pageShareLinks,
  pages,
  pageVersions,
  spaceEvents,
  spaceMembers,
  spaces,
} from "@raypx/database/schema";
import {
  MAX_PAGES_PER_SPACE,
  PageError,
  pageSchema,
  pageShareLinkSchema,
  pageVersionSchema,
  type PageId,
  type PageInput,
  type PageVersion,
} from "@raypx/core/pages";
import { normalizeTaskJson } from "@raypx/core/task-text";
import type { SpaceScope } from "@raypx/spaces/server";
import { PageExecutionFenceError, type PageActor, type PagesRepository } from "./types.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type PageRow = typeof pages.$inferSelect;
type VersionRow = typeof pageVersions.$inferSelect;
function pageView(row: PageRow) {
  return pageSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
function versionView(page: PageRow, row: VersionRow): PageVersion {
  return pageVersionSchema.parse({
    ...pageView(page),
    version: row.version,
    title: row.title,
    kind: row.kind,
    body: row.body,
    author: row.author,
    reason: row.reason,
    updatedAt: row.createdAt.toISOString(),
  });
}
function linkView(row: typeof pageShareLinks.$inferSelect) {
  const { tokenHash: _tokenHash, ...safe } = row;
  return pageShareLinkSchema.parse({
    ...safe,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  });
}
function selectPage(scope: SpaceScope, id: PageId) {
  return and(eq(pages.spaceId, scope.spaceId), eq(pages.id, id));
}
async function requiredPage(
  tx: Transaction | Database,
  scope: SpaceScope,
  id: PageId,
  lock = false,
) {
  const query = tx.select().from(pages).where(selectPage(scope, id));
  const [row] = await (lock ? query.for("update") : query);
  if (!row) throw new PageError("PAGE_NOT_FOUND");
  return row;
}
async function requiredVersion(
  tx: Transaction | Database,
  spaceId: string,
  pageId: string,
  version: number,
) {
  const [row] = await tx
    .select()
    .from(pageVersions)
    .where(
      and(
        eq(pageVersions.spaceId, spaceId),
        eq(pageVersions.pageId, pageId),
        eq(pageVersions.version, version),
      ),
    );
  if (!row) throw new PageError("PAGE_NOT_FOUND");
  return row;
}
async function requireAgent(tx: Transaction, scope: SpaceScope, id: PageInput["agentId"]) {
  if (id === null) return;
  const [row] = await tx
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.spaceId, scope.spaceId), eq(agents.id, id), isNull(agents.deletedAt)));
  if (!row) throw new PageError("PAGE_NOT_FOUND");
}
async function assertExecution(tx: Transaction, scope: SpaceScope, actor: PageActor) {
  if (actor.kind !== "run") return;
  if (!actor.runId || !actor.execution || !actor.agentId) throw new PageExecutionFenceError();
  const { conversationId, ownerId, fence } = actor.execution;
  await tx
    .select({ sequence: conversationCounters.sequence })
    .from(conversationCounters)
    .where(
      and(
        eq(conversationCounters.spaceId, scope.spaceId),
        eq(conversationCounters.conversationId, conversationId),
      ),
    )
    .for("update");
  const [run] = await tx
    .select({ id: conversationRuns.id })
    .from(conversationRuns)
    .where(
      and(
        eq(conversationRuns.spaceId, scope.spaceId),
        eq(conversationRuns.conversationId, conversationId),
        eq(conversationRuns.id, actor.runId),
        eq(conversationRuns.agentId, actor.agentId),
        eq(conversationRuns.memberAccountId, actor.accountId),
        eq(conversationRuns.leaseOwner, ownerId),
        eq(conversationRuns.fence, fence),
        sql`${conversationRuns.leaseExpiresAt} > clock_timestamp()`,
        or(eq(conversationRuns.state, "running"), eq(conversationRuns.state, "waiting")),
        sql`exists (select 1 from ${spaceMembers} inner join ${spaces} on ${spaces.id} = ${spaceMembers.spaceId} where ${spaceMembers.spaceId} = ${scope.spaceId} and ${spaceMembers.accountId} = ${actor.accountId} and ${spaceMembers.removedAt} is null and ${spaces.deletionClaimedAt} is null)`,
      ),
    )
    .for("update");
  if (!run) throw new PageExecutionFenceError();
}
function assertMaintainer(row: PageRow, actor: PageActor) {
  if (actor.kind === "run" && row.agentId !== actor.agentId) throw new PageError("PAGE_NOT_FOUND");
}
async function emit(
  tx: Transaction,
  spaceId: string,
  kind: "page.created" | "page.updated" | "page.deleted",
  pageId: string,
  version: number,
) {
  const [event] = await tx
    .insert(spaceEvents)
    .values({ spaceId, kind, payload: { pageId, version } })
    .returning();
  await tx.execute(
    sql`select pg_notify('raypx_space_events', ${JSON.stringify({ spaceId, sequence: event!.id, kind })})`,
  );
}
async function save(
  tx: Transaction,
  page: PageRow,
  body: string,
  reason: VersionRow["reason"],
  actor: PageActor,
  now: Date,
) {
  const [version] = await tx
    .insert(pageVersions)
    .values({
      spaceId: page.spaceId,
      pageId: page.id,
      version: page.version,
      title: page.title,
      kind: page.kind,
      body: normalizeTaskJson(body),
      author: { kind: actor.kind, accountId: actor.accountId, runId: actor.runId ?? null },
      reason,
      mutationKey: actor.mutationKey ?? null,
      createdAt: now,
    })
    .returning();
  await emit(
    tx,
    page.spaceId,
    reason === "created" ? "page.created" : "page.updated",
    page.id,
    page.version,
  );
  return versionView(page, version!);
}
async function repeated(
  tx: Transaction,
  scope: SpaceScope,
  id: PageId,
  actor: PageActor,
  body: string,
  version: number,
) {
  if (!actor.mutationKey) return null;
  const [saved] = await tx
    .select()
    .from(pageVersions)
    .where(
      and(eq(pageVersions.spaceId, scope.spaceId), eq(pageVersions.mutationKey, actor.mutationKey)),
    );
  if (!saved) return null;
  if (
    saved.pageId !== id ||
    saved.version !== version ||
    saved.body !== normalizeTaskJson(body) ||
    saved.author.runId !== actor.runId
  )
    throw new PageError("PAGE_CONFLICT");
  return versionView(await requiredPage(tx, scope, id), saved);
}
export function createPagesRepository(db: Database): PagesRepository {
  return {
    async list(scope, input) {
      const rows = await db
        .select()
        .from(pages)
        .where(
          and(
            eq(pages.spaceId, scope.spaceId),
            input.agentId ? eq(pages.agentId, input.agentId) : undefined,
          ),
        )
        .orderBy(desc(pages.updatedAt), asc(pages.id))
        .limit(input.limit);
      return rows.map(pageView);
    },
    async get(scope, id, version) {
      const [row] = await db
        .select({ page: pages, version: pageVersions })
        .from(pages)
        .innerJoin(
          pageVersions,
          and(
            eq(pageVersions.spaceId, pages.spaceId),
            eq(pageVersions.pageId, pages.id),
            version === undefined
              ? eq(pageVersions.version, pages.version)
              : eq(pageVersions.version, version),
          ),
        )
        .where(selectPage(scope, id));
      if (!row) throw new PageError("PAGE_NOT_FOUND");
      return versionView(row.page, row.version);
    },
    async create(scope, id, input, actor, now) {
      return db.transaction(async (tx) => {
        await assertExecution(tx, scope, actor);
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${scope.spaceId}, 48305))`,
        );
        const replay = await repeated(tx, scope, id, actor, input.body, 1);
        if (replay) {
          if (
            replay.agentId !== input.agentId ||
            replay.title !== input.title ||
            replay.kind !== input.kind
          )
            throw new PageError("PAGE_CONFLICT");
          return replay;
        }
        if (actor.kind === "run" && input.agentId !== actor.agentId)
          throw new PageError("PAGE_NOT_FOUND");
        await requireAgent(tx, scope, input.agentId);
        const [count] = await tx
          .select({ value: sql<number>`count(*)::integer` })
          .from(pages)
          .where(eq(pages.spaceId, scope.spaceId));
        if ((count?.value ?? 0) >= MAX_PAGES_PER_SPACE) throw new PageError("PAGE_LIMIT");
        const [row] = await tx
          .insert(pages)
          .values({
            id,
            spaceId: scope.spaceId,
            agentId: input.agentId,
            title: normalizeTaskJson(input.title),
            kind: input.kind,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        return save(tx, row!, input.body, "created", actor, now);
      });
    },
    async update(scope, id, expected, body, actor, now) {
      return db.transaction(async (tx) => {
        await assertExecution(tx, scope, actor);
        const current = await requiredPage(tx, scope, id, true);
        assertMaintainer(current, actor);
        const replay = await repeated(tx, scope, id, actor, body, expected + 1);
        if (replay) return replay;
        if (current.version !== expected) throw new PageError("PAGE_CONFLICT");
        const [row] = await tx
          .update(pages)
          .set({ version: current.version + 1, updatedAt: now })
          .where(selectPage(scope, id))
          .returning();
        return save(tx, row!, body, "updated", actor, now);
      });
    },
    async rename(scope, id, expected, title, actor, now) {
      return db.transaction(async (tx) => {
        await assertExecution(tx, scope, actor);
        const current = await requiredPage(tx, scope, id, true);
        assertMaintainer(current, actor);
        if (current.version !== expected) throw new PageError("PAGE_CONFLICT");
        const version = await requiredVersion(tx, scope.spaceId, id, current.version);
        const [row] = await tx
          .update(pages)
          .set({ title: normalizeTaskJson(title), version: current.version + 1, updatedAt: now })
          .where(selectPage(scope, id))
          .returning();
        return save(tx, row!, version.body, "renamed", actor, now);
      });
    },
    async delete(scope, id, expected, _now) {
      return db.transaction(async (tx) => {
        const current = await requiredPage(tx, scope, id, true);
        if (current.version !== expected) throw new PageError("PAGE_CONFLICT");
        await tx.delete(pages).where(selectPage(scope, id));
        await emit(tx, scope.spaceId, "page.deleted", id, current.version);
        return { deleted: true as const };
      });
    },
    async versions(scope, id, limit) {
      const page = await requiredPage(db, scope, id);
      const rows = await db
        .select({
          spaceId: pageVersions.spaceId,
          pageId: pageVersions.pageId,
          version: pageVersions.version,
          title: pageVersions.title,
          kind: pageVersions.kind,
          author: pageVersions.author,
          reason: pageVersions.reason,
          createdAt: pageVersions.createdAt,
        })
        .from(pageVersions)
        .where(and(eq(pageVersions.spaceId, scope.spaceId), eq(pageVersions.pageId, id)))
        .orderBy(desc(pageVersions.version))
        .limit(limit);
      return rows.map((row) => {
        const { body: _body, ...metadata } = versionView(page, {
          ...row,
          body: "",
          mutationKey: null,
        });
        return metadata;
      });
    },
    async restore(scope, id, expected, version, actor, now) {
      return db.transaction(async (tx) => {
        await assertExecution(tx, scope, actor);
        const current = await requiredPage(tx, scope, id, true);
        assertMaintainer(current, actor);
        if (current.version !== expected) throw new PageError("PAGE_CONFLICT");
        const source = await requiredVersion(tx, scope.spaceId, id, version);
        const [row] = await tx
          .update(pages)
          .set({
            title: source.title,
            kind: source.kind,
            version: current.version + 1,
            updatedAt: now,
          })
          .where(selectPage(scope, id))
          .returning();
        return save(tx, row!, source.body, "restored", actor, now);
      });
    },
    async createShareLink(scope, id, linkId, tokenHash, version, expiresAt, now) {
      return db.transaction(async (tx) => {
        await requiredPage(tx, scope, id, true);
        if (version !== null) await requiredVersion(tx, scope.spaceId, id, version);
        const [count] = await tx
          .select({ value: sql<number>`count(*)::integer` })
          .from(pageShareLinks)
          .where(and(eq(pageShareLinks.spaceId, scope.spaceId), eq(pageShareLinks.pageId, id)));
        if ((count?.value ?? 0) >= 100) throw new PageError("PAGE_LIMIT");
        const [row] = await tx
          .insert(pageShareLinks)
          .values({
            spaceId: scope.spaceId,
            id: linkId,
            pageId: id,
            tokenHash,
            version,
            expiresAt,
            createdAt: now,
          })
          .returning();
        return linkView(row!);
      });
    },
    async shareLinks(scope, id) {
      await requiredPage(db, scope, id);
      return (
        await db
          .select()
          .from(pageShareLinks)
          .where(and(eq(pageShareLinks.spaceId, scope.spaceId), eq(pageShareLinks.pageId, id)))
          .orderBy(desc(pageShareLinks.createdAt), asc(pageShareLinks.id))
          .limit(100)
      ).map(linkView);
    },
    async revokeShareLinks(scope, id, linkId, now) {
      return db.transaction(async (tx) => {
        await requiredPage(tx, scope, id, true);
        const rows = await tx
          .update(pageShareLinks)
          .set({ revokedAt: now })
          .where(
            and(
              eq(pageShareLinks.spaceId, scope.spaceId),
              eq(pageShareLinks.pageId, id),
              linkId ? eq(pageShareLinks.id, linkId) : undefined,
              isNull(pageShareLinks.revokedAt),
            ),
          )
          .returning({ id: pageShareLinks.id });
        return { revoked: rows.length };
      });
    },
    async resolveShare(tokenHash, now) {
      const [row] = await db
        .select({ page: pages, version: pageVersions })
        .from(pageShareLinks)
        .innerJoin(
          pages,
          and(eq(pages.spaceId, pageShareLinks.spaceId), eq(pages.id, pageShareLinks.pageId)),
        )
        .innerJoin(spaces, and(eq(spaces.id, pages.spaceId), isNull(spaces.deletionClaimedAt)))
        .innerJoin(
          pageVersions,
          and(
            eq(pageVersions.spaceId, pages.spaceId),
            eq(pageVersions.pageId, pages.id),
            eq(
              pageVersions.version,
              sql<number>`coalesce(${pageShareLinks.version}, ${pages.version})`,
            ),
          ),
        )
        .where(
          and(
            eq(pageShareLinks.tokenHash, tokenHash),
            isNull(pageShareLinks.revokedAt),
            or(isNull(pageShareLinks.expiresAt), gt(pageShareLinks.expiresAt, now)),
          ),
        );
      return row ? versionView(row.page, row.version) : null;
    },
  };
}
