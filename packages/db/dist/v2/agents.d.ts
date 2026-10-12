import type { AgentRunV2, AgentRunV2Repository } from "@voidmix/core";
import type { Database } from "./types.js";
export declare class PostgresAgentRunV2Repository implements AgentRunV2Repository {
    private readonly db;
    constructor(db: Database);
    getById(id: string): Promise<AgentRunV2 | null>;
    create({ now, ...record }: Parameters<AgentRunV2Repository["create"]>[0]): Promise<AgentRunV2>;
    createQueued(input: Parameters<AgentRunV2Repository["create"]>[0]): Promise<AgentRunV2>;
    updateStatus(input: Parameters<AgentRunV2Repository["updateStatus"]>[0]): Promise<AgentRunV2 | null>;
}
//# sourceMappingURL=agents.d.ts.map