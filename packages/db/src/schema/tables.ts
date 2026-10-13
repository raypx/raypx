import * as identity from "./identity.js";
import * as projects from "./projects.js";
import * as resources from "./resources.js";
import {
  cloudMutations,
  cloudConversations,
  cloudTurns,
  cloudSpendingGrants,
  cloudMessages,
  cloudExecutionGrants,
  cloudTasks,
  cloudTaskRounds,
  cloudRuns,
  cloudExecutions,
  cloudTools,
  cloudSources,
  cloudAssets,
  cloudRevisions,
  cloudUsageCalls,
  cloudCommands,
  cloudEvents,
} from "./cloud.js";

/** Active tables only. Migration definitions additionally preserve retired tables. */
export const schema = {
  ...identity,
  ...projects,
  ...resources,
  cloudMutations,
  cloudConversations,
  cloudTurns,
  cloudSpendingGrants,
  cloudMessages,
  cloudExecutionGrants,
  cloudTasks,
  cloudTaskRounds,
  cloudRuns,
  cloudExecutions,
  cloudTools,
  cloudSources,
  cloudAssets,
  cloudRevisions,
  cloudUsageCalls,
  cloudCommands,
  cloudEvents,
};
