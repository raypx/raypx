import { first, inserted } from "./results.js";
import { asc, desc, eq } from "drizzle-orm";
import type { Database } from "./types.js";
import type { FeedbackV2, FeedbackV2Repository, ReviewV2, ReviewV2Repository } from "@voidmix/core";
import { v2Feedback, v2Reviews } from "../schema.js";
export class PostgresReviewV2Repository implements ReviewV2Repository {
  constructor(private readonly db: Database) {}

  async getById(id: string): Promise<ReviewV2 | null> {
    return first(this.db.select().from(v2Reviews).where(eq(v2Reviews.id, id)).limit(1));
  }

  async listByProject(projectId: string): Promise<ReviewV2[]> {
    return this.db
      .select()
      .from(v2Reviews)
      .where(eq(v2Reviews.projectId, projectId))
      .orderBy(desc(v2Reviews.updatedAt), desc(v2Reviews.id));
  }

  async create({ now, ...record }: Parameters<ReviewV2Repository["create"]>[0]): Promise<ReviewV2> {
    return inserted(
      this.db
        .insert(v2Reviews)
        .values({
          ...record,
          status: "open",
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
      "Review insert",
    );
  }

  async update(input: Parameters<ReviewV2Repository["update"]>[0]): Promise<ReviewV2 | null> {
    return first(
      this.db
        .update(v2Reviews)
        .set({ status: input.status, updatedAt: input.now })
        .where(eq(v2Reviews.id, input.id))
        .returning(),
    );
  }
}

export class PostgresFeedbackV2Repository implements FeedbackV2Repository {
  constructor(private readonly db: Database) {}

  async listByReview(reviewId: string): Promise<FeedbackV2[]> {
    return this.db
      .select()
      .from(v2Feedback)
      .where(eq(v2Feedback.reviewId, reviewId))
      .orderBy(asc(v2Feedback.createdAt), asc(v2Feedback.id));
  }

  async create({
    now,
    ...record
  }: Parameters<FeedbackV2Repository["create"]>[0]): Promise<FeedbackV2> {
    return inserted(
      this.db
        .insert(v2Feedback)
        .values({
          ...record,
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
      "Feedback insert",
    );
  }
}
