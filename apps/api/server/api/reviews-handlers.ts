import type { RouterContext } from "./router-context.js";
export function createReviewsHandlers({ authenticated, reviews, command, list }: RouterContext) {
  return {
    list: authenticated.projects.reviews.list.handler(list(() => reviews().listReviews)),
    create: authenticated.projects.reviews.create.handler(command(() => reviews().createReview)),
    update: authenticated.projects.reviews.update.handler(command(() => reviews().updateReview)),
    feedback: {
      list: authenticated.projects.reviews.feedback.list.handler(
        list(() => reviews().listFeedback),
      ),
      create: authenticated.projects.reviews.feedback.create.handler(
        command(() => reviews().createFeedback),
      ),
    },
  };
}
