import { first, inserted } from "./results.js";
import { desc, eq, and } from "drizzle-orm";
import type { Database } from "./types.js";
import { cursorPage, timestampKey } from "../pagination.js";
import { resourceVisibility } from "./visibility.js";
import type {
  AssetV2,
  AssetV2Repository,
  AssetVersionV2,
  AssetVersionV2Repository,
  VisibleResourceQuery,
} from "@voidmix/core";
import { v2Assets, v2AssetVersions } from "../schema.js";
export class PostgresAssetV2Repository implements AssetV2Repository {
  constructor(private readonly db: Database) {}
  async listVisible(query: VisibleResourceQuery) {
    const page = cursorPage(query, `assets:${query.actorId}:${query.projectId ?? ""}`);
    const time = timestampKey(v2Assets.updatedAt);
    let statement = this.db
      .select()
      .from(v2Assets)
      .where(
        and(
          resourceVisibility(query.actorId, v2Assets.projectId),
          query.projectId ? eq(v2Assets.projectId, query.projectId) : undefined,
          page.seek(time, v2Assets.id),
        ),
      )
      .orderBy(desc(time), desc(v2Assets.id))
      .$dynamic();
    if (page.limit !== undefined) statement = statement.limit(page.limit + 1);
    return page.finish(await statement, (row) => row.updatedAt);
  }

  async getById(id: string): Promise<AssetV2 | null> {
    return first(this.db.select().from(v2Assets).where(eq(v2Assets.id, id)).limit(1));
  }
  async listByProject(projectId: string): Promise<AssetV2[]> {
    return this.db
      .select()
      .from(v2Assets)
      .where(eq(v2Assets.projectId, projectId))
      .orderBy(desc(v2Assets.updatedAt), desc(v2Assets.id));
  }
  async create({ now, ...record }: Parameters<AssetV2Repository["create"]>[0]): Promise<AssetV2> {
    return inserted(
      this.db
        .insert(v2Assets)
        .values({
          ...record,
          archived: false,
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
      "Asset insert",
    );
  }
}

export class PostgresAssetVersionV2Repository implements AssetVersionV2Repository {
  constructor(private readonly db: Database) {}
  async getById(id: string) {
    return first(this.db.select().from(v2AssetVersions).where(eq(v2AssetVersions.id, id)).limit(1));
  }

  async listByAsset(assetId: string): Promise<AssetVersionV2[]> {
    return this.db
      .select()
      .from(v2AssetVersions)
      .where(eq(v2AssetVersions.assetId, assetId))
      .orderBy(desc(v2AssetVersions.createdAt), desc(v2AssetVersions.id));
  }
  async create({
    now,
    ...record
  }: Parameters<AssetVersionV2Repository["create"]>[0]): Promise<AssetVersionV2> {
    return inserted(
      this.db
        .insert(v2AssetVersions)
        .values({
          ...record,
          createdAt: now,
        })
        .returning(),
      "Asset version insert",
    );
  }
}
