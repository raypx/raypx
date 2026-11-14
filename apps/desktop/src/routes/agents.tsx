import { useMemo, useState } from "react";
import { useTranslations } from "../i18n.js";
import { AgentsWorkspace } from "@raypx/agents/client";
import { pageIdSchema } from "@raypx/core/pages";
import { parseAgentSelection } from "@raypx/agents/model";
import { createFileRoute, Navigate, useLocation } from "@tanstack/react-router";
import { useSettingsNavigation } from "../features/settings/navigation.js";
import { agentsClient } from "../features/agents/client.js";
import { desktopConversationSocket } from "../features/agents/socket.js";
import { RemoteBoundary } from "../features/auth/components/remote-boundary.js";
import { apiUrl, webUrl, authClient } from "../features/auth/client.js";
import { desktopReturnTo } from "../features/auth/return-to.js";

export const Route = createFileRoute("/agents")({
  ssr: false,
  preload: false,
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
  const session = authClient.useSession();
  const href = useLocation({ select: (location) => location.href });
  const [returnTo] = useState(() => desktopReturnTo(href));
  if (!session.isPending && !session.error && !session.data)
    return <Navigate to="/login" search={{ returnTo }} replace />;
  return (
    <RemoteBoundary>
      {(accountId) => <SignedInAgents key={`${apiUrl}:${accountId}`} accountId={accountId} />}
    </RemoteBoundary>
  );
}

function SignedInAgents({ accountId }: { accountId: string }) {
  const pageCopy = useTranslations("pages");
  const settings = useSettingsNavigation();
  const settingsHash = useLocation({ select: (location) => location.hash });
  const selection = Route.useSearch();
  const navigate = Route.useNavigate();
  const socket = useMemo(() => desktopConversationSocket(accountId), [accountId]);
  return (
    <AgentsWorkspace
      client={agentsClient}
      groups={agentsClient.conversations}
      spaceManagement={agentsClient.spaces}
      accountApprovalSettings={agentsClient.approvals}
      invitationOrigin={webUrl}
      accountId={accountId}
      origin={apiUrl}
      socket={socket}
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
  );
}
