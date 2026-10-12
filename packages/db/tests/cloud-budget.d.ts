import { type CloudApplication } from "@voidmix/application";
import type { CloudRepository } from "@voidmix/core";
/** Both adapters must charge the same Task across distinct requesting accounts. */
export declare function exerciseSharedTaskBudget(service: CloudApplication, repository: CloudRepository, projectId: string): Promise<void>;
//# sourceMappingURL=cloud-budget.d.ts.map