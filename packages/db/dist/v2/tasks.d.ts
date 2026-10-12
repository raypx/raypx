import type { Database } from "./types.js";
import type { ProjectTaskV2Repository, TaskV2 } from "@voidmix/core";
export declare class PostgresProjectTaskV2Repository implements ProjectTaskV2Repository {
    private readonly db;
    constructor(db: Database);
    getById(id: string): Promise<TaskV2 | null>;
    listByProject(projectId: string): Promise<TaskV2[]>;
    create({ now, ...record }: Parameters<ProjectTaskV2Repository["create"]>[0]): Promise<TaskV2>;
    update(input: Parameters<ProjectTaskV2Repository["update"]>[0]): Promise<TaskV2 | null>;
}
//# sourceMappingURL=tasks.d.ts.map