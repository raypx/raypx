/** Normalize Drizzle's returning/select arrays at the adapter boundary. */
export declare function first<Row>(rows: PromiseLike<Row[]>): Promise<Row | null>;
export declare function inserted<Row>(rows: PromiseLike<Row[]>, operation: string): Promise<Row>;
//# sourceMappingURL=results.d.ts.map