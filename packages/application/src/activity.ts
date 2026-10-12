import type { ActivityApplication, ActivityOptions } from "./types.js";
export function createActivityApplication(options: ActivityOptions): ActivityApplication {
  return {
    async listActivity(input) {
      if (input.projectId)
        await options.access.requireProject(
          input.actorId,
          input.projectId,
          "project.read",
          "Activity access denied.",
        );
      return options.activity.listVisible(input);
    },
  };
}
