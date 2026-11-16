import { useState } from "react";

import { pageIdSchema } from "@raypx/core/pages";
import { parseAgentSelection } from "@raypx/agents/model";
import { createFileRoute, Navigate, useLocation } from "@tanstack/react-router";

import { RemoteBoundary } from "../features/auth/components/remote-boundary.js";
import { authClient } from "../features/auth/client.js";
import { useDesktopSignOut } from "../features/auth/sign-out.js";
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
  const signOut = useDesktopSignOut();
  const href = useLocation({ select: (location) => location.href });
  const [returnTo] = useState(() => desktopReturnTo(href));
  if (!signOut.suppressSessionRedirect && !session.isPending && !session.error && !session.data)
    return <Navigate to="/login" search={{ returnTo }} replace />;
  return <RemoteBoundary>{() => null}</RemoteBoundary>;
}
