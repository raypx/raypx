import { type PostgresJsDatabase } from "drizzle-orm/postgres-js";
export interface DatabaseConnection {
    db: PostgresJsDatabase;
    close(): Promise<void>;
}
export declare function connectDatabase(databaseUrl: string): DatabaseConnection;
export declare function migrateDatabase(databaseUrl: string, migrationsFolder?: string): Promise<void>;
export declare function resetDatabase(databaseUrl: string): Promise<void>;
//# sourceMappingURL=connection.d.ts.map