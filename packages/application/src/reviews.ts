import type { ReviewApplication, ReviewOptions } from "./types.js";
import { executionContext } from "./execution.js";
import { requireResource, requiredText } from "./context.js";
export function createReviewApplication(options: ReviewOptions): ReviewApplication {
  const { now, id } = executionContext(options);
  const { requireProject } = options.access;
  return {
    async listReviews({ actorId, projectId }) {
      await requireProject(actorId, projectId, "project.read", "Review access denied.");
      return options.reviews.listByProject(projectId);
    },

    async createReview({ actorId, projectId, assetVersionId, title }) {
      await requireProject(actorId, projectId, "project.write", "Review creation denied.");
      if (assetVersionId !== null) {
        const version = requireResource(
          await options.assetVersions.getById(assetVersionId),
          "Review creation denied.",
        );
        requireResource(
          version.projectId === projectId ? version : null,
          "Review creation denied.",
        );
      }
      const normalizedTitle = requiredText(title, "Review title");
      return options.reviews.create({
        id: id(),
        projectId,
        assetVersionId,
        createdByUserId: actorId,
        title: normalizedTitle,
        now: now(),
      });
    },

    async updateReview({ actorId, reviewId, status }) {
      const review = requireResource(
        await options.reviews.getById(reviewId),
        "Review access denied.",
      );
      await requireProject(actorId, review.projectId, "project.manage", "Review approval denied.");
      const updated = await options.reviews.update({ id: reviewId, status, now: now() });
      return requireResource(updated, "Review access denied.");
    },

    async listFeedback({ actorId, reviewId }) {
      const review = requireResource(
        await options.reviews.getById(reviewId),
        "Feedback access denied.",
      );
      await requireProject(actorId, review.projectId, "project.read", "Feedback access denied.");
      return options.feedback.listByReview(reviewId);
    },

    async createFeedback({ actorId, reviewId, body }) {
      const review = requireResource(
        await options.reviews.getById(reviewId),
        "Feedback creation denied.",
      );
      await requireProject(
        actorId,
        review.projectId,
        "project.comment",
        "Feedback creation denied.",
      );
      const normalizedBody = requiredText(body, "Feedback body");
      return options.feedback.create({
        id: id(),
        reviewId,
        projectId: review.projectId,
        authorId: actorId,
        body: normalizedBody,
        now: now(),
      });
    },
  };
}
