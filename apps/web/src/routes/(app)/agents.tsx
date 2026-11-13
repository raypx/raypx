import { AgentsWorkspace } from "@raypx/agents/client";
import { parseAgentSelection } from "@raypx/agents/model";
import { createFileRoute, Navigate, useLocation } from "@tanstack/react-router";
import { agentsClient } from "../../features/agents/client.js";
import { SessionBoundary } from "../../features/auth/components/session-boundary.js";
import { apiUrl } from "../../features/auth/client.js";
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
  const selection = Route.useSearch();
  const navigate = Route.useNavigate();
  const href = useLocation({ select: (location) => location.href });
  return (
    <SessionBoundary
      guest={<Navigate to="/login" search={{ returnTo: safeReturnTo(href) }} replace />}
    >
      {(accountId) => (
        <AgentsWorkspace
          key={`${apiUrl}:${accountId}`}
          client={agentsClient}
          accountId={accountId}
          origin={apiUrl}
          {...selection}
          onNavigate={(next) => void navigate({ search: parseAgentSelection(next) })}
        />
      )}
    </SessionBoundary>
  );
}
