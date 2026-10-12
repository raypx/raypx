/** Optional duplicate-identity guard. Execution ownership is fenced by each Run's expiring lease. */
export declare function acquireCloudWorkerLease(databaseUrl: string, ownerId: string, onLost?: (error: Error) => void): Promise<{
    close(): Promise<void>;
}>;
//# sourceMappingURL=cloud-worker-lease.d.ts.map