import type { Database } from "./types.js";
import type { ActivityV2, ActivityV2Repository, VisibleResourceQuery } from "@voidmix/core";
export declare class PostgresActivityV2Repository implements ActivityV2Repository {
    private readonly db;
    constructor(db: Database);
    listVisible(query: VisibleResourceQuery): Promise<CursorPage<T>>;
    listByProject(projectId: string): Promise<ActivityV2[]>;
}
//# sourceMappingURL=activity.d.ts.map