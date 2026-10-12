import { cloudQueries } from "../../lib/cloud-queries";
import { createFileRoute } from "@tanstack/react-router";
import { createRouteApiClient } from "../../lib/route-api";
import { ConversationWorkspace } from "../../features/conversations/conversation-workspace";
import { RouteError, RoutePending } from "../../features/navigation/route-state";
export const Route = createFileRoute("/(app)/chat/$conversationId")({
  loader: async ({ context, params, abortController }) => {
    const api = createRouteApiClient();
    const options = { signal: abortController.signal };
    const [initial] = await Promise.all([
      api.cloud.conversations.snapshot({ conversationId: params.conversationId }, options),
      context.queryClient.ensureQueryData(cloudQueries(context, api).capabilities()),
    ]);
    const project =
      initial.conversation.scope.type === "project"
        ? await context.queryClient.ensureQueryData(
            cloudQueries(context, api).project(initial.conversation.scope.projectId),
          )
        : null;
    return {
      accountId: context.accountId,
      initial,
      writable: !project || project.access === "write" || project.access === "manage",
    };
  },
  component: ConversationPage,
  pendingComponent: RoutePending,
  errorComponent: RouteError,
});
function ConversationPage() {
  const { accountId, initial, writable } = Route.useLoaderData();
  return (
    <ConversationWorkspace
      key={`${accountId}:${initial.conversation.id}`}
      initial={initial}
      writable={writable}
    />
  );
}
