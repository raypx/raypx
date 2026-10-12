import { z } from "zod";
import { authoredResourceFields, resourceFields } from "./common.js";
import { createCursorPageSchema, procedure } from "./common.js";

export const reviewStatusV2Schema = z.enum(["open", "approved", "rejected"]);

export const reviewV2Schema = z.object({
  ...authoredResourceFields,
  assetVersionId: z.string().min(1).nullable(),
  status: reviewStatusV2Schema,
  title: z.string().min(1),
  updatedAt: z.date(),
});

export const feedbackV2Schema = z.object({
  ...resourceFields,
  reviewId: z.string().min(1),
  authorId: z.string().min(1),
  body: z.string().min(1),
  updatedAt: z.date(),
});

export const v2ListReviews = procedure(
  { projectId: z.string().min(1) },
  createCursorPageSchema(reviewV2Schema),
);

export const v2CreateReview = procedure(
  {
    projectId: z.string().min(1),
    assetVersionId: z.string().min(1).nullable(),
    title: z.string().trim().min(1).max(500),
  },
  reviewV2Schema,
);

export const v2UpdateReview = procedure(
  { reviewId: z.string().min(1), status: reviewStatusV2Schema },
  reviewV2Schema,
);

export const v2ListFeedback = procedure(
  { reviewId: z.string().min(1) },
  createCursorPageSchema(feedbackV2Schema),
);

export const v2CreateFeedback = procedure(
  { reviewId: z.string().min(1), body: z.string().trim().min(1).max(10_000) },
  feedbackV2Schema,
);
