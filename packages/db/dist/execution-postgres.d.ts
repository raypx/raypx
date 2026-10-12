import type { ExecutionRepository, ExecutionTransaction } from "@voidmix/core";
import type { Database } from "./v2/types.js";
export declare class PostgresExecutionRepository implements ExecutionRepository {
    private readonly db;
    constructor(db: Database);
    read<T>(operation: (tx: ExecutionTransaction) => Promise<T>): Promise<T>;
    transaction<T>(operation: (tx: ExecutionTransaction) => Promise<T>): Promise<T>;
}
//# sourceMappingURL=execution-postgres.d.ts.map