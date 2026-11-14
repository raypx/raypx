import { useTranslations } from "../../i18n.js";
import { AgentsWorkspace } from "@raypx/agents/client";
import { pageIdSchema } from "@raypx/core/pages";
import { parseAgentSelection } from "@raypx/agents/model";
import { createFileRoute, Navigate, useLocation } from "@tanstack/react-router";
import { useSettingsNavigation } from "../../features/settings/navigation.js";
import { agentsClient } from "../../features/agents/client.js";
import { SessionBoundary } from "../../features/auth/components/session-boundary.js";
import { apiUrl, webUrl } from "../../features/auth/client.js";
import { safeReturnTo } from "../../features/auth/return-to.js";
import { PageAccessFeedback, webPageGuard } from "../../features/auth/route-guard.js";

export const Route = createFileRoute("/(app)/agents")({
  beforeLoad: webPageGuard("/agents"),
  errorComponent: PageAccessFeedback,
  staticData: { page: { title: "agents.title", layout: "tool" } },
  validateSearch: (search: Record<string, unknown>) => {
    const pageRef = pageIdSchema.safeParse(search.pageRef);
    return {
      ...parseAgentSelection(search),
      ...(pageRef.success ? { pageRef: pageRef.data } : {}),
    };
  },
  component: AgentsPage,
});

function AgentsPage() {
  const pageCopy = useTranslations("pages");
  const settings = useSettingsNavigation();
  const selection = Route.useSearch();
  const navigate = Route.useNavigate();
  const href = useLocation({ select: (location) => location.href });
  const settingsHash = useLocation({ select: (location) => location.hash });
  return (
    <SessionBoundary
      guest={<Navigate to="/login" search={{ returnTo: safeReturnTo(href) }} replace />}
    >
      {(accountId) => (
        <AgentsWorkspace
          key={`${apiUrl}:${accountId}`}
          client={agentsClient}
          onSessionEnded={() =>
            void navigate({ to: "/login", search: { returnTo: "/agents" }, replace: true })
          }
          groups={agentsClient.conversations}
          spaceManagement={agentsClient.spaces}
          accountApprovalSettings={agentsClient.approvals}
          invitationOrigin={webUrl}
          accountId={accountId}
          origin={apiUrl}
          {...selection}
          composerReference={
            selection.pageRef && selection.spaceId
              ? {
                  id: selection.pageRef,
                  text: `[${pageCopy("title")}](${apiUrl}/page-content/member/${encodeURIComponent(selection.spaceId)}/${encodeURIComponent(selection.pageRef)})`,
                }
              : undefined
          }
          onOpenPage={(pageId) =>
            void navigate({
              to: "/pages",
              search: {
                ...(selection.spaceId ? { spaceId: selection.spaceId } : {}),
                ...(pageId ? { pageId: pageIdSchema.parse(pageId) } : {}),
              },
            })
          }
          modelCatalogKey={settingsHash}
          onOpenModels={() => void settings.open("models")}
          onNavigate={(next) => void navigate({ search: parseAgentSelection(next) })}
        />
      )}
    </SessionBoundary>
  );
}
