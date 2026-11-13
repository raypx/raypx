import { AgentsWorkspace } from "@raypx/agents/client";
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
  validateSearch: parseAgentSelection,
  component: AgentsPage,
});

function AgentsPage() {
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
          groups={agentsClient.conversations}
          spaceManagement={agentsClient.spaces}
          accountApprovalSettings={agentsClient.approvals}
          invitationOrigin={webUrl}
          accountId={accountId}
          origin={apiUrl}
          {...selection}
          modelCatalogKey={settingsHash}
          onOpenModels={() => void settings.open("models")}
          onNavigate={(next) => void navigate({ search: parseAgentSelection(next) })}
        />
      )}
    </SessionBoundary>
  );
}
