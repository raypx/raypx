import type { CloudRepository, CloudTransaction, CloudEntities, CloudEntityKind, CloudQuery, OutboxEvent, ProjectV2, ProjectMemberV2, OrganizationMemberV2 } from "@voidmix/core";
export declare function cloudParentIds(kind: CloudEntityKind, value: CloudEntities[CloudEntityKind]): string[];
export declare function cloudActorId(kind: CloudEntityKind, value: CloudEntities[CloudEntityKind]): string | null;
export declare function cloudMatches<K extends CloudEntityKind>(kind: K, entity: CloudEntities[K], query: CloudQuery): boolean;
/** Tests explicitly seed trusted identities; an unknown account is never admitted. */
export declare class InMemoryCloudRepository implements CloudRepository {
    private state;
    private tail;
    constructor(input?: {
        users?: {
            id: string;
            active?: boolean;
            email?: string;
            displayName?: string;
            role?: "user" | "admin" | "owner";
        }[];
        projects?: ProjectV2[];
        projectMembers?: ProjectMemberV2[];
        organizationMembers?: OrganizationMemberV2[];
    });
    read<T>(operation: (tx: CloudTransaction) => Promise<T>): Promise<T>;
    transaction<T>(_keys: readonly string[], operation: (tx: CloudTransaction) => Promise<T>): Promise<T>;
    outboxItems(): Promise<OutboxEvent[]>;
    setUserActive(actorId: string, active: boolean): void;
}
//# sourceMappingURL=cloud-memory.d.ts.map