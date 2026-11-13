import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import { spaces, spaceMembers, user } from "@raypx/database/schema";
import {
  SpaceNotFound,
  spaceSchema,
  spaceMemberSchema,
  spaceInputSchema,
  type SpaceId,
  type Space,
  type SpaceInput,
  type SpaceMember,
} from "@raypx/core/spaces";

import { resolveSpaceScope } from "../scope.js";
import type { SpaceAccess, SpaceMembership, SpacesRepository, SpaceScope } from "../server.js";
function spaceView(row: typeof spaces.$inferSelect): Space {
  return spaceSchema.parse({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
function memberView(row: typeof spaceMembers.$inferSelect): SpaceMember {
  return spaceMemberSchema.parse({ ...row, createdAt: row.createdAt.toISOString() });
}

export function createSpacesRepository(db: Database): SpacesRepository {
  return {
    async get(scope: SpaceScope): Promise<Space> {
      const [row] = await db.select().from(spaces).where(eq(spaces.id, scope.spaceId)).limit(1);
      if (!row) throw new SpaceNotFound();
      return spaceView(row);
    },
    async getMember(scope: SpaceScope, accountId: string): Promise<SpaceMember> {
      const [row] = await db
        .select()
        .from(spaceMembers)
        .where(and(eq(spaceMembers.spaceId, scope.spaceId), eq(spaceMembers.accountId, accountId)))
        .limit(1);
      if (!row) throw new SpaceNotFound();
      return memberView(row);
    },
  };
}

/** Account-scoped discovery/bootstrap is separate from Space-scoped content repositories. */
export function createSpaceAccess(db: Database): SpaceAccess {
  async function create(accountId: string, input: SpaceInput): Promise<SpaceMembership> {
    const values = spaceInputSchema.parse(input);
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(spaces)
        .values({ ...values, id: crypto.randomUUID() })
        .returning();
      const [member] = await tx
        .insert(spaceMembers)
        .values({ spaceId: row!.id, accountId, role: "owner" })
        .returning();
      return { space: spaceView(row!), member: memberView(member!) };
    });
  }
  async function ensurePrivateSpace(accountId: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Lock the account, not a caller-chosen Space. Independent first requests serialize.
      const [account] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, accountId))
        .for("update");
      if (!account) throw new SpaceNotFound();
      const [existing] = await tx
        .select({ id: spaces.id })
        .from(spaces)
        .where(eq(spaces.privateFor, accountId))
        .limit(1);
      if (existing) return;
      const id = crypto.randomUUID();
      await tx.insert(spaces).values({ id, name: "Personal", privateFor: accountId });
      await tx.insert(spaceMembers).values({ spaceId: id, accountId, role: "owner" });
    });
  }
  return {
    async list(accountId: string): Promise<SpaceMembership[]> {
      await ensurePrivateSpace(accountId);
      const rows = await db
        .select({ space: spaces, member: spaceMembers })
        .from(spaceMembers)
        .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
        .where(eq(spaceMembers.accountId, accountId))
        .orderBy(asc(spaces.createdAt), asc(spaces.id));
      return rows.map((row) => ({ space: spaceView(row.space), member: memberView(row.member) }));
    },
    async create(accountId: string, input: SpaceInput) {
      await ensurePrivateSpace(accountId);
      return create(accountId, input);
    },
    async resolve(accountId: string, requestedSpaceId: SpaceId): Promise<SpaceScope> {
      await ensurePrivateSpace(accountId);
      const [row] = await db
        .select()
        .from(spaceMembers)
        .where(
          and(eq(spaceMembers.spaceId, requestedSpaceId), eq(spaceMembers.accountId, accountId)),
        )
        .limit(1);
      if (!row) throw new SpaceNotFound();
      const member = memberView(row);
      return resolveSpaceScope(member, accountId, requestedSpaceId);
    },
  };
}
