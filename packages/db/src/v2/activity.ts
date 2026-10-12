import { desc, eq, and } from "drizzle-orm";
import type { Database } from "./types.js";
import { cursorPage, timestampKey } from "../pagination.js";
import { resourceVisibility } from "./visibility.js";
import type { ActivityV2, ActivityV2Repository, VisibleResourceQuery } from "@voidmix/core";
import { v2Activities } from "../schema.js";
export class PostgresActivityV2Repository implements ActivityV2Repository {
  constructor(private readonly db: Database) {}
  async listVisible(query: VisibleResourceQuery) {
    const page = cursorPage(query, `activity:${query.actorId}:${query.projectId ?? ""}`);
    const time = timestampKey(v2Activities.occurredAt);
    let statement = this.db
      .select()
      .from(v2Activities)
      .where(
        and(
          resourceVisibility(query.actorId, v2Activities.projectId),
          query.projectId ? eq(v2Activities.projectId, query.projectId) : undefined,
          page.seek(time, v2Activities.id),
        ),
      )
      .orderBy(desc(time), desc(v2Activities.id))
      .$dynamic();
    if (page.limit !== undefined) statement = statement.limit(page.limit + 1);
    return page.finish(await statement, (row) => row.occurredAt);
  }

  async listByProject(projectId: string): Promise<ActivityV2[]> {
    return this.db
      .select()
      .from(v2Activities)
      .where(eq(v2Activities.projectId, projectId))
      .orderBy(desc(v2Activities.occurredAt), desc(v2Activities.id));
  }
}
