import type { ExecutionRepository, ExecutionTransaction, OutboxEvent } from "@voidmix/core";
/** Atomic copy-on-commit transactions preserve rollback and prevent mutable read leaks. */
export declare class InMemoryExecutionRepository implements ExecutionRepository {
    private state;
    private tail;
    read<T>(operation: (tx: ExecutionTransaction) => Promise<T>): Promise<T>;
    transaction<T>(operation: (tx: ExecutionTransaction) => Promise<T>): Promise<T>;
    outboxItems(): Promise<OutboxEvent[]>;
}
//# sourceMappingURL=execution-memory.d.ts.map