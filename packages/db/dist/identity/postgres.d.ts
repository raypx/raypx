import type { AuditEvent, User, UserListQuery, UserPage, UserRepository, UserStatus } from "@voidmix/core";
import { type PostgresJsDatabase } from "drizzle-orm/postgres-js";
export declare class PostgresUserRepository implements UserRepository {
    private readonly db;
    constructor(db: Pick<PostgresJsDatabase, "select" | "insert" | "update" | "execute" | "transaction">);
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
//# sourceMappingURL=postgres.d.ts.map