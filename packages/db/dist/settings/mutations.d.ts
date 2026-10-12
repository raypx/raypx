import type { AuditEvent, UpdateAuthSettingsInput, UpdateMailSettingsInput } from "@voidmix/core";
import { type StoredConfigurationValue } from "./values.js";
interface Mutation {
    key: string;
    value: string | null;
    action: "set" | "reset" | "replace";
}
export interface SettingChange extends Mutation {
    operation: string;
}
export declare function authMutations(input: UpdateAuthSettingsInput): Mutation[];
export declare function mailMutations(input: UpdateMailSettingsInput): Mutation[];
export declare function secretMutations(input: UpdateMailSettingsInput): Array<Mutation | undefined>;
/** Compute changed keys without exposing their values to audit reporting. */
export declare function changesFor(existing: ReadonlyMap<string, StoredConfigurationValue>, mutations: Array<Mutation | undefined>): SettingChange[];
export declare function changedAudit(audit: AuditEvent, changes: SettingChange[]): AuditEvent;
export declare function applyMemoryChanges(store: Map<string, StoredConfigurationValue>, changes: SettingChange[], input: {
    actorId: string;
    audit: AuditEvent;
}): void;
export {};
//# sourceMappingURL=mutations.d.ts.map