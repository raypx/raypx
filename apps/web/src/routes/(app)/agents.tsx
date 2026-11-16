import { pageIdSchema } from "@raypx/core/pages";
import { parseAgentSelection } from "@raypx/agents/model";
import { createFileRoute, Navigate, useLocation } from "@tanstack/react-router";

import { SessionBoundary } from "../../features/auth/components/session-boundary.js";

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
  const href = useLocation({ select: (location) => location.href });
  return (
    <SessionBoundary
      guest={<Navigate to="/login" search={{ returnTo: safeReturnTo(href) }} replace />}
    >
      {() => null}
    </SessionBoundary>
  );
}
