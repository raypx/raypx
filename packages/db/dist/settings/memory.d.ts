import { SettingsReader } from "./reader.js";
import type { AuditEvent, SystemSettingsRepository } from "@voidmix/core";
export declare class InMemorySystemSettingsRepository extends SettingsReader implements SystemSettingsRepository {
    readonly settings: any;
    readonly secrets: any;
    readonly auditEvents: AuditEvent[];
    constructor(options?: {
        settings?: Readonly<Record<string, string>>;
        secrets?: Readonly<Record<string, string>>;
        auditEvents?: AuditEvent[];
        updatedAt?: Date;
    });
    protected readSettings(keys: readonly string[]): any;
    protected readSecret(key: string): any;
    updateAuthSettings(input: Parameters<SystemSettingsRepository["updateAuthSettings"]>[0]): Promise<AuthSettingsView>;
    updateMailSettings(input: Parameters<SystemSettingsRepository["updateMailSettings"]>[0]): Promise<MailSettings>;
}
//# sourceMappingURL=memory.d.ts.map