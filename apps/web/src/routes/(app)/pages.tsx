import { AgentsWorkspace } from "@raypx/agents/client";
import { parseAgentSelection } from "@raypx/agents/model";
import { spaceIdSchema } from "@raypx/core/spaces";
import { pageIdSchema } from "@raypx/core/pages";
import type { PagesClientPort } from "@raypx/pages/model";
import { PagesWorkspace } from "@raypx/pages/client";
import { createFileRoute, Navigate, useLocation } from "@tanstack/react-router";
import { agentsClient } from "../../features/agents/client.js";
import { apiUrl } from "../../features/auth/client.js";
import { SessionBoundary } from "../../features/auth/components/session-boundary.js";
import { webPageGuard, PageAccessFeedback } from "../../features/auth/route-guard.js";
import { safeReturnTo } from "../../features/auth/return-to.js";

export const Route = createFileRoute("/(app)/pages")({
  beforeLoad: webPageGuard("/pages"),
  errorComponent: PageAccessFeedback,
  staticData: { page: { title: "pages.title", layout: "tool" } },
  validateSearch: (search: Record<string, unknown>) => {
    const pageId = pageIdSchema.safeParse(search.pageId);
    return {
      ...parseAgentSelection({ spaceId: search.spaceId }),
      ...(pageId.success ? { pageId: pageId.data } : {}),
    };
  },
  component: PagesPage,
});
function PagesPage() {
  const href = useLocation({ select: (location) => location.href });
  return (
    <SessionBoundary
      guest={<Navigate to="/login" search={{ returnTo: safeReturnTo(href) }} replace />}
    >
      {(accountId) => <SignedInPages key={`${apiUrl}:${accountId}`} accountId={accountId} />}
    </SessionBoundary>
  );
}
function SignedInPages({ accountId }: { accountId: string }) {
  const port: PagesClientPort = agentsClient.pages;
  const selection = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AgentsWorkspace
      client={agentsClient}
      groups={agentsClient.conversations}
      spaceManagement={agentsClient.spaces}
      accountApprovalSettings={agentsClient.approvals}
      accountId={accountId}
      origin={apiUrl}
      {...(selection.spaceId ? { spaceId: selection.spaceId } : {})}
      onNavigate={(next) => {
        if (next.agentId || next.groupId)
          void navigate({ to: "/agents", search: parseAgentSelection(next) });
        else void navigate({ search: { spaceId: spaceIdSchema.parse(next.spaceId) } });
      }}
      renderWorkspace={({ spaceId, agents, subscribe, accountNames }) => (
        <PagesWorkspace
          key={spaceId}
          spaceId={spaceIdSchema.parse(spaceId)}
          port={port}
          apiOrigin={apiUrl}
          canEmbedAuthenticatedDocuments
          agents={agents}
          accountNames={accountNames}
          initialPageId={selection.pageId ? pageIdSchema.parse(selection.pageId) : null}
          subscribe={subscribe}
          onSelectPage={(pageId) =>
            void navigate({
              search: { spaceId: spaceIdSchema.parse(spaceId), ...(pageId ? { pageId } : {}) },
            })
          }
          onAskAgent={(agentId, page) =>
            void navigate({
              to: "/agents",
              search: { ...parseAgentSelection({ spaceId, agentId }), pageRef: page.id },
            })
          }
        />
      )}
    />
  );
}
