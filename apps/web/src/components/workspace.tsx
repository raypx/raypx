import { useTranslations } from "../i18n.js";
import { AgentsWorkspace, type PageResultMountProps } from "@raypx/agents/client";
import { PageResultPreview } from "@raypx/pages/client";
import { pageIdSchema } from "@raypx/core/pages";
import { parseAgentSelection } from "@raypx/agents/model";
import { Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useSettingsNavigation } from "../features/settings/navigation.js";
import { agentsClient } from "../features/agents/client.js";

import { apiOrigin, webOrigin } from "../features/auth/client.js";

import type { ReactNode } from "react";
import type { WorkspaceSidebarSlots } from "@raypx/blocks/shell";

export function WebWorkspace({
  accountId,
  renderShell,
}: {
  accountId: string;
  renderShell: (sidebar: WorkspaceSidebarSlots, content: ReactNode) => ReactNode;
}) {
  const pageCopy = useTranslations("pages");
  const settings = useSettingsNavigation();
  const location = useLocation();
  const settingsHash = location.hash;
  const pathname = location.pathname;
  const search = location.search;
  const pageRef = pageIdSchema.safeParse("pageRef" in search ? search.pageRef : undefined);
  const selection = {
    ...parseAgentSelection(search),
    pageRef: pageRef.success ? pageRef.data : undefined,
  };
  const navigate = useNavigate();
  return (
    <AgentsWorkspace
      route={pathname}
      ensureSpaceSearch={["/agents", "/pages", "/settings"].includes(pathname)}
      renderShell={renderShell}
      renderWorkspace={pathname === "/pages" || !accountId ? () => <Outlet /> : undefined}
      onNewConversation={(spaceId) =>
        void navigate({ to: "/agents", search: parseAgentSelection({ spaceId }) })
      }
      client={agentsClient}
      onSessionEnded={() =>
        void navigate({ to: "/login", search: { returnTo: "/agents" }, replace: true })
      }
      groups={agentsClient.conversations}
      spaceManagement={agentsClient.spaces}
      accountApprovalSettings={agentsClient.approvals}
      invitationOrigin={webOrigin()}
      accountId={accountId}
      origin={apiOrigin()}
      {...selection}
      composerReference={
        selection.pageRef && selection.spaceId
          ? {
              id: selection.pageRef,
              text: `[${pageCopy("title")}](${apiOrigin()}/api/pages/member/${encodeURIComponent(selection.spaceId)}/${encodeURIComponent(selection.pageRef)})`,
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
      pageResultPreview={ChatPagePreview}
      browser={agentsClient.browsers}
      modelCatalogKey={settingsHash}
      onOpenModels={() => void settings.open("models")}
      onOpenTools={() => void settings.open("tools")}
      onNavigate={(next, replace) => {
        const nextSearch = parseAgentSelection(next);
        const hash = replace ? settingsHash : "";
        if (next.agentId || next.groupId || pathname === "/agents") {
          void navigate({ to: "/agents", search: nextSearch, hash, replace: replace ?? false });
        } else if (pathname === "/pages") {
          void navigate({ to: "/pages", search: nextSearch, hash, replace: replace ?? false });
        } else if (pathname === "/settings") {
          void navigate({ to: "/settings", search: nextSearch, hash, replace: replace ?? false });
        } else {
          void navigate({ to: "/agents", search: nextSearch });
        }
      }}
    >
      {["/agents", "/pages"].includes(pathname) ? undefined : <Outlet />}
    </AgentsWorkspace>
  );
}

function ChatPagePreview(props: PageResultMountProps) {
  return (
    <PageResultPreview
      {...props}
      apiOrigin={apiOrigin()}
      read={agentsClient.pages.get}
      canEmbedAuthenticatedDocuments
    />
  );
}
