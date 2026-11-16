import { useWorkspaceContext } from "@raypx/agents/client";
import { parseAgentSelection } from "@raypx/agents/model";
import { spaceIdSchema } from "@raypx/core/spaces";
import { pageIdSchema } from "@raypx/core/pages";
import type { PagesClientPort } from "@raypx/pages/model";
import { PagesWorkspace } from "@raypx/pages/client";
import { createFileRoute, Navigate, useLocation } from "@tanstack/react-router";
import { agentsClient } from "../features/agents/client.js";

import { RemoteBoundary } from "../features/auth/components/remote-boundary.js";
import { isDesktop, getBridge } from "../lib/desktop.js";
import { apiUrl, webUrl, authClient } from "../features/auth/client.js";
import { useDesktopSignOut } from "../features/auth/sign-out.js";
import { desktopReturnTo } from "../features/auth/return-to.js";

export const Route = createFileRoute("/pages")({
  ssr: false,
  preload: false,
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
  const session = authClient.useSession();
  const signOut = useDesktopSignOut();
  const href = useLocation({ select: (location) => location.href });
  if (!signOut.suppressSessionRedirect && !session.isPending && !session.error && !session.data)
    return <Navigate to="/login" search={{ returnTo: desktopReturnTo(href) }} replace />;
  return (
    <RemoteBoundary>
      {(accountId) => <SignedInPages key={`${apiUrl}:${accountId}`} accountId={accountId} />}
    </RemoteBoundary>
  );
}
function SignedInPages({ accountId: _accountId }: { accountId: string }) {
  const { spaceId, agents, subscribe, accountNames } = useWorkspaceContext();
  const port: PagesClientPort = agentsClient.pages;
  const selection = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PagesWorkspace
      key={spaceId}
      spaceId={spaceIdSchema.parse(spaceId)}
      port={port}
      apiOrigin={apiUrl}
      canEmbedAuthenticatedDocuments={false}
      onOpenWebPreview={() => {
        const url = new URL("/pages", webUrl);
        url.searchParams.set("spaceId", spaceId);
        if (selection.pageId) url.searchParams.set("pageId", selection.pageId);
        if (!isDesktop()) {
          window.open(url.href, "_blank", "noopener,noreferrer");
          return;
        }
        void getBridge()
          .then((bridge) => bridge.request.openExternal({ url: url.href }))
          .catch(() => {});
      }}
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
  );
}
