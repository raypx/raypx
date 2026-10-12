import { createProjectAccess } from "./context.js";
import { executionContext } from "./execution.js";
import type { ProjectOptions, ProjectApplication } from "./types.js";
import { projectsCommands } from "./projects.js";
import { membersCommands } from "./members.js";
import { tasksCommands } from "./tasks.js";
export { createProjectAccess } from "./context.js";
export { createAssetApplication } from "./assets.js";
export { createReviewApplication } from "./reviews.js";
export { createActivityApplication } from "./activity.js";
export { createUserAdministration } from "./identity.js";
export { createAgentRunApplication, type AgentRunApplication } from "./agent-v2.js";
export type * from "./types.js";
export type {
  OrganizationMemberV2Repository,
  ProjectMemberV2Repository,
  ProjectV2Repository,
  ProjectTaskV2Repository,
  FeedbackV2Repository,
  ReviewV2Repository,
} from "@voidmix/core";
export function createProjectApplication(options: ProjectOptions): ProjectApplication {
  const context = { options, ...executionContext(options), ...createProjectAccess(options) };
  return { ...projectsCommands(context), ...membersCommands(context), ...tasksCommands(context) };
}

export { createExecutionApplication, type ExecutionApplication } from "./agent-execution.js";

export {
  createCloudApplication,
  type CloudApplication,
  type CloudApplicationOptions,
} from "./cloud.js";
