import { SettingsReader } from "./reader.js";
import type { SystemSettingsRepository } from "@voidmix/core";
import { type PostgresJsDatabase } from "drizzle-orm/postgres-js";
export declare class PostgresSystemSettingsRepository extends SettingsReader implements SystemSettingsRepository {
    private readonly db;
    constructor(db: PostgresJsDatabase);
    protected readSettings(keys: readonly string[]): Promise<any>;
    protected readSecret(key: string): Promise<any>;
    updateAuthSettings(input: Parameters<SystemSettingsRepository["updateAuthSettings"]>[0]): Promise<any>;
    updateMailSettings(input: Parameters<SystemSettingsRepository["updateMailSettings"]>[0]): Promise<any>;
}
//# sourceMappingURL=postgres.d.ts.map