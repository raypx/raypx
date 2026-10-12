import type { OutboxEvent, OutboxRepository } from "@voidmix/core";
import type { DatabaseConnection } from "./postgres.js";
type Database = DatabaseConnection["db"];
export declare class PostgresOutboxRepository implements OutboxRepository {
    private readonly db;
    constructor(db: Database);
    claim(input: {
        workerId: string;
        limit: number;
        leaseMs: number;
    }): Promise<OutboxEvent[]>;
    acknowledge(input: {
        id: string;
        workerId: string;
    }): Promise<void>;
    release(input: {
        id: string;
        workerId: string;
    }): Promise<void>;
}
export {};
//# sourceMappingURL=outbox.d.ts.map