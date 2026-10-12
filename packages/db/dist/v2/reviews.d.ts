import type { Database } from "./types.js";
import type { FeedbackV2, FeedbackV2Repository, ReviewV2, ReviewV2Repository } from "@voidmix/core";
export declare class PostgresReviewV2Repository implements ReviewV2Repository {
    private readonly db;
    constructor(db: Database);
    getById(id: string): Promise<ReviewV2 | null>;
    listByProject(projectId: string): Promise<ReviewV2[]>;
    create({ now, ...record }: Parameters<ReviewV2Repository["create"]>[0]): Promise<ReviewV2>;
    update(input: Parameters<ReviewV2Repository["update"]>[0]): Promise<ReviewV2 | null>;
}
export declare class PostgresFeedbackV2Repository implements FeedbackV2Repository {
    private readonly db;
    constructor(db: Database);
    listByReview(reviewId: string): Promise<FeedbackV2[]>;
    create({ now, ...record }: Parameters<FeedbackV2Repository["create"]>[0]): Promise<FeedbackV2>;
}
//# sourceMappingURL=reviews.d.ts.map