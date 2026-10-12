import { AppShell } from "../../features/navigation/app-shell";
import { useEffect, useRef } from "react";
import {
  Navigate,
  createFileRoute,
  redirect,
  useLocation,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";

import { useTranslations } from "../../i18n/client";
import { normalizeAuthRedirect } from "../../features/auth/route-search";
import { useSession } from "../../lib/auth-client";
import { createRouteApiClient } from "../../lib/route-api";

export const Route = createFileRoute("/(app)")({
  beforeLoad: async ({ location, abortController }) => {
    try {
      const account = await createRouteApiClient().account.get(
        {},
        { signal: abortController.signal },
      );
      return { accountId: account.id, actorId: account.id };
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "UNAUTHORIZED"))
        throw error;
      const redirectTo = `${location.pathname}${location.searchStr}${location.hash ? `#${location.hash}` : ""}`;
      throw redirect({ to: "/login", search: { redirect: redirectTo } });
    }
  },
  component: AuthenticatedAppLayout,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
});

function AuthenticatedAppLayout() {
  const t = useTranslations("workspaceUi");
  const session = useSession();
  const location = useLocation();
  const router = useRouter();
  const userId = session.data?.user.id ?? null;
  const previousAccount = useRef<string | null>(Route.useRouteContext().accountId);
  const staleAccount = useRouterState({
    select: (state) =>
      state.matches.some((match) => {
        const data = match.loaderData;
        return data && typeof data === "object" && "accountId" in data && data.accountId !== userId;
      }),
  });
  useEffect(() => {
    if (session.isPending) return;
    const previous = previousAccount.current;
    previousAccount.current = userId;
    if (previous && previous !== userId) {
      router.options.context.resources.disposeAccount(previous);
      const predicate = (query: { queryKey: readonly unknown[] }) =>
        query.queryKey[0] === "cloud" && query.queryKey[2] === previous;
      void router.options.context.queryClient.cancelQueries({ predicate });
      router.options.context.queryClient.removeQueries({ predicate });
    }
    if (!staleAccount) return;
    router.clearCache({ filter: (match) => match.routeId.startsWith("/(app)") });
    void router.invalidate({ filter: (match) => match.routeId.startsWith("/(app)") });
  }, [router, userId, session.isPending, staleAccount]);
  if (session.isPending || (userId && staleAccount)) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background px-4 text-sm text-muted-foreground">
        {t("loadingSession")}
      </div>
    );
  }
  if (!session.data?.user) {
    const redirect = normalizeAuthRedirect(
      `${location.pathname}${location.searchStr}${location.hash ? `#${location.hash}` : ""}`,
    );
    return <Navigate replace to="/login" {...(redirect ? { search: { redirect } } : {})} />;
  }

  return <AppShell key={userId} />;
}
