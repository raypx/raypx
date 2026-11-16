import { getBridge, isDesktop, pairDeviceConnector, grantDeviceDirectory } from "../lib/desktop.js";
import { useMemo } from "react";
import { useTranslations } from "../i18n.js";
import { AgentsWorkspace, type PageResultMountProps } from "@raypx/agents/client";
import { PageResultPreview } from "@raypx/pages/client";
import { pageIdSchema } from "@raypx/core/pages";
import { parseAgentSelection } from "@raypx/agents/model";
import { Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useSettingsNavigation } from "../features/settings/navigation.js";
import { agentsClient } from "../features/agents/client.js";
import { desktopConversationFeed, desktopConversationSocket } from "../features/agents/socket.js";

import { apiUrl, webUrl } from "../features/auth/client.js";
import { useDesktopSignOut } from "../features/auth/sign-out.js";

const nativeDeviceConfirmation = { pair: pairDeviceConnector, grant: grantDeviceDirectory };

import type { ReactNode } from "react";
import type { WorkspaceSidebarSlots } from "@raypx/blocks/shell";

export function DesktopWorkspace({
  accountId,
  renderShell,
}: {
  accountId: string;
  renderShell: (sidebar: WorkspaceSidebarSlots, content: ReactNode) => ReactNode;
}) {
  const signOut = useDesktopSignOut();
  const pageCopy = useTranslations("pages");
  const settings = useSettingsNavigation();
  const location = useLocation();
  const settingsHash = location.hash;
  const socket = useMemo(() => desktopConversationSocket(accountId), [accountId]);
  const feed = useMemo(() => desktopConversationFeed(accountId), [accountId]);
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
      ensureSpaceSearch={["/agents", "/pages", "/account"].includes(pathname)}
      renderShell={renderShell}
      renderWorkspace={pathname === "/pages" || !accountId ? () => <Outlet /> : undefined}
      onNewConversation={(spaceId) =>
        void navigate({ to: "/agents", search: parseAgentSelection({ spaceId }) })
      }
      client={agentsClient}
      nativeDeviceConfirmation={isDesktop() ? nativeDeviceConfirmation : undefined}
      onOpenExternal={(url) => {
        if (!isDesktop()) {
          window.open(url, "_blank", "noopener,noreferrer");
          return;
        }
        void getBridge()
          .then((bridge) => bridge.request.openExternal({ url }))
          .catch(() => {});
      }}
      onSessionEnded={() => signOut.sessionEnded("/agents")}
      groups={agentsClient.conversations}
      spaceManagement={agentsClient.spaces}
      accountApprovalSettings={agentsClient.approvals}
      invitationOrigin={webUrl}
      accountId={accountId}
      origin={apiUrl}
      socket={socket}
      feed={feed}
      {...selection}
      composerReference={
        selection.pageRef && selection.spaceId
          ? {
              id: selection.pageRef,
              text: `[${pageCopy("title")}](${apiUrl}/api/pages/member/${encodeURIComponent(selection.spaceId)}/${encodeURIComponent(selection.pageRef)})`,
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
        } else if (pathname === "/account") {
          void navigate({ to: "/account", search: nextSearch, hash, replace: replace ?? false });
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
      apiOrigin={apiUrl}
      read={agentsClient.pages.get}
      canEmbedAuthenticatedDocuments={false}
    />
  );
}
