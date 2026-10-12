import type { CloudRepository, CloudTransaction } from "@voidmix/core";
import type { Database } from "./v2/types.js";
export declare class PostgresCloudRepository implements CloudRepository {
    private readonly db;
    constructor(db: Database);
    read<T>(operation: (tx: CloudTransaction) => Promise<T>): Promise<T>;
    transaction<T>(keys: readonly string[], operation: (tx: CloudTransaction) => Promise<T>): Promise<T>;
}
//# sourceMappingURL=cloud-postgres.d.ts.map