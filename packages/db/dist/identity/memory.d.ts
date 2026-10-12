import type { AuditEvent, User, UserListQuery, UserPage, UserRepository, UserStatus } from "@voidmix/core";
export declare class InMemoryUserRepository implements UserRepository {
    private administrationQueue;
    readonly users: any;
    readonly auditEvents: AuditEvent[];
    constructor(seed?: readonly User[]);
    runAdministration<T>(operation: (users: UserRepository) => Promise<T>): Promise<T>;
    list(query: UserListQuery): Promise<UserPage>;
    getById(id: string): Promise<User | null>;
    getByEmail(email: string): Promise<User | null>;
    countActiveAdministrators(): Promise<number>;
    save(user: User): Promise<void>;
    updateStatus(id: string, status: UserStatus): Promise<User>;
    appendAudit(event: AuditEvent): Promise<void>;
    listAudit(limit: number): Promise<AuditEvent[]>;
}
//# sourceMappingURL=memory.d.ts.map