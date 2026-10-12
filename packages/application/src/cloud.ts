import { createCloudContext, type CloudApplicationOptions } from "./cloud/context.js";
import { cloudConversations } from "./cloud/conversations.js";
import { cloudTasks } from "./cloud/tasks.js";
import { cloudRuns } from "./cloud/runs.js";
import { cloudAssets } from "./cloud/assets.js";
import { cloudUsage } from "./cloud/usage.js";
import { cloudNotifications } from "./cloud/notifications.js";
import { cloudAdmin } from "./cloud/admin.js";
export type { CloudApplicationOptions } from "./cloud/context.js";
export function createCloudApplication(options: CloudApplicationOptions) {
  const context = createCloudContext(options);
  return {
    ...cloudConversations(context),
    ...cloudTasks(context),
    ...cloudRuns(context),
    ...cloudAssets(context),
    ...cloudUsage(context),
    ...cloudNotifications(context),
    ...cloudAdmin(context),
  };
}
export type CloudApplication = ReturnType<typeof createCloudApplication>;
