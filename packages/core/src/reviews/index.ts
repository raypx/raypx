import type { AuthoredResource, ProjectResource, NewRecord } from "../resources.js";
export const reviewStatusesV2 = ["open", "approved", "rejected"] as const;
export type ReviewStatusV2 = (typeof reviewStatusesV2)[number];

export interface ReviewV2 extends AuthoredResource {
  assetVersionId: string | null;
  status: ReviewStatusV2;
  title: string;
}

export interface ReviewV2Repository {
  getById(id: string): Promise<ReviewV2 | null>;
  listByProject(projectId: string): Promise<ReviewV2[]>;
  create(input: NewRecord<ReviewV2, "status">): Promise<ReviewV2>;
  update(input: { id: string; status: ReviewStatusV2; now: Date }): Promise<ReviewV2 | null>;
}

export interface FeedbackV2 extends ProjectResource {
  reviewId: string;
  authorId: string;
  body: string;
}

export interface FeedbackV2Repository {
  listByReview(reviewId: string): Promise<FeedbackV2[]>;
  create(input: NewRecord<FeedbackV2>): Promise<FeedbackV2>;
}
