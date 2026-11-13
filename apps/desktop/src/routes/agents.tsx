import { useMemo, useState } from "react";
import { AgentsWorkspace } from "@raypx/agents/client";
import { parseAgentSelection } from "@raypx/agents/model";
import { createFileRoute, Navigate, useLocation } from "@tanstack/react-router";
import { useSettingsNavigation } from "../features/settings/navigation.js";
import { agentsClient } from "../features/agents/client.js";
import { desktopConversationSocket } from "../features/agents/socket.js";
import { RemoteBoundary } from "../features/auth/components/remote-boundary.js";
import { apiUrl, authClient } from "../features/auth/client.js";
import { desktopReturnTo } from "../features/auth/return-to.js";

export const Route = createFileRoute("/agents")({
  ssr: false,
  preload: false,
  staticData: { page: { title: "agents.title", layout: "tool" } },
  validateSearch: parseAgentSelection,
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
  const settings = useSettingsNavigation();
  const settingsHash = useLocation({ select: (location) => location.hash });
  const selection = Route.useSearch();
  const navigate = Route.useNavigate();
  const socket = useMemo(() => desktopConversationSocket(accountId), [accountId]);
  return (
    <AgentsWorkspace
      client={agentsClient}
      accountId={accountId}
      origin={apiUrl}
      socket={socket}
      {...selection}
      modelCatalogKey={settingsHash}
      onOpenModels={() => void settings.open("models")}
      onNavigate={(next) => void navigate({ search: parseAgentSelection(next) })}
    />
  );
}
