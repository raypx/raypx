export {
  isLocalWorkspace,
  workspaceDraftKey,
  workspaceOwner,
  workspaceScopeKey,
  type WorkspaceScope,
} from "./model/scope.js";
export { ConversationState, type ConversationGap } from "./model/conversation.js";
export {
  createTaskDraft,
  MAX_TASK_DRAFTS,
  readTaskDrafts,
  sameDraft,
  type DraftInput,
  type TaskDraft,
} from "./model/drafts.js";
export {
  MAX_DIFF_LINES,
  replacementDiff,
  unifiedDiff,
  type DiffFile,
  type DiffLine,
} from "./model/diff.js";
export type {
  DeviceManagementPort,
  TaskChangeSource,
  TaskHistoryPage,
  TaskReadOptions,
  TaskWorkspacePort,
} from "./model/port.js";
