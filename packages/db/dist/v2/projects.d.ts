import type { VisibleResourceQuery } from "@voidmix/core";
import type { OrganizationMemberV2, OrganizationMemberV2Repository, ProjectMemberV2, ProjectMemberV2Repository, ProjectV2, ProjectV2Repository } from "@voidmix/core";
import type { Database } from "./types.js";
export declare class PostgresProjectV2Repository implements ProjectV2Repository {
    private readonly db;
    constructor(db: Database);
    getById(id: string): Promise<ProjectV2 | null>;
    listVisible(query: VisibleResourceQuery): Promise<CursorPage<T>>;
    create(input: Parameters<ProjectV2Repository["create"]>[0]): Promise<ProjectV2>;
    update(input: Parameters<ProjectV2Repository["update"]>[0]): Promise<ProjectV2 | null>;
    setArchived(input: {
        id: string;
        archived: boolean;
        now: Date;
    }): Promise<ProjectV2 | null>;
    delete(id: string): Promise<boolean>;
}
export declare class PostgresProjectMemberV2Repository implements ProjectMemberV2Repository {
    private readonly db;
    constructor(db: Database);
    private mutate;
    getByProjectAndUser(input: {
        projectId: string;
        userId: string;
    }): Promise<ProjectMemberV2 | null>;
    listByProject(projectId: string): Promise<ProjectMemberV2[]>;
    upsert(input: {
        projectId: string;
        userId: string;
        role: ProjectMemberV2["role"];
        now: Date;
    }): Promise<ProjectMemberV2>;
    remove(input: {
        projectId: string;
        userId: string;
        now: Date;
    }): Promise<ProjectMemberV2 | null>;
}
export declare class PostgresOrganizationMemberV2Repository implements OrganizationMemberV2Repository {
    private readonly db;
    constructor(db: Database);
    getByOrganizationAndUser(input: {
        organizationId: string;
        userId: string;
    }): Promise<OrganizationMemberV2 | null>;
    listByUser(userId: string): Promise<OrganizationMemberV2[]>;
}
//# sourceMappingURL=projects.d.ts.map