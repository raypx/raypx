import type { CloudRepository } from "@voidmix/core";
/** Shared black-box cases run against both adapters; the clock is injected at the application seam. */
export declare function exerciseRoundAndLease(repository: CloudRepository): Promise<void>;
export declare function exercisePublicationCAS(repository: CloudRepository): Promise<void>;
//# sourceMappingURL=cloud-rounds.d.ts.map