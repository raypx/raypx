import { SessionBoundary, SignInGate } from "../features/auth/components/session-boundary";
import { useEffect, useRef } from "react";
import {
  Link,
  Outlet,
  useMatches,
  useRouter,
  type StaticDataRouteOption,
} from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "@raypx/i18n/browser";
import { AppShell, type ShellLinkProps, type ShellNavItem } from "@raypx/blocks/shell";
import { AdjustmentsIcon } from "@raypx/icons/adjustments";
import { UserCircleIcon } from "@raypx/icons/user-circle";
import { BookOpenIcon } from "@raypx/icons/book-open";
import { ArrowLeftIcon } from "@raypx/icons/arrow-left";
import { authClient } from "../features/auth/client";
import { publicConfigurationQuery } from "../features/configuration/client";
import { PermissionBoundary } from "../features/auth/components/permission-boundary";
import { accountAccessQuery, canAccessWebPage, type WebPath } from "../features/auth/access";
import { UserButton } from "./user-button";
function AdminLink({ to, markActive, exact, ...props }: ShellLinkProps<WebPath>) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: exact ?? false }}
      activeProps={markActive ? { "aria-current": "page" } : {}}
      {...props}
    />
  );
}
export function AdminShell() {
  const c = useTranslations("common"),
    t = useTranslations();
  const session = authClient.useSession();
  const id = !session.error && !session.isPending ? (session.data?.user.id ?? null) : null;
  const router = useRouter();
  const cache = useQueryClient();
  const previous = useRef(id);
  useEffect(() => {
    if (previous.current !== id) {
      previous.current = id;
      cache.removeQueries({ queryKey: ["account"] });
      void router.invalidate();
    }
  }, [id, cache, router]);
  const access = useQuery(accountAccessQuery(id));
  const site = useQuery(publicConfigurationQuery());
  const page = useMatches({
    select: (matches) =>
      matches.reduce<StaticDataRouteOption["page"]>(
        (found, match) => match.staticData.page ?? found,
        undefined,
      ),
  });
  const navigation: ShellNavItem<WebPath>[] = [
    { to: "/admin", exact: true, label: c("overview"), icon: <AdjustmentsIcon /> },
    { to: "/admin/users", label: c("users"), icon: <UserCircleIcon /> },
    { to: "/admin/settings", label: c("adminSettings"), icon: <AdjustmentsIcon /> },
    { to: "/admin/audit", label: c("auditLog"), icon: <BookOpenIcon /> },
  ];
  return (
    <AppShell
      brand={{
        to: "/admin",
        label: site.data?.siteName ?? "Raypx",
        description: c("adminConsole"),
      }}
      navigation={[
        navigation.filter((item) =>
          canAccessWebPage(access.isError ? undefined : access.data, item.to),
        ),
      ]}
      navigationLabels={[c("adminConsole")]}
      secondaryNavigation={[
        { to: "/projects", label: c("backToWorkspace"), icon: <ArrowLeftIcon /> },
      ]}
      LinkComponent={AdminLink}
      breadcrumbs={page ? [t(page.title)] : []}
      layout={page?.layout ?? "document"}
      account={<UserButton variant="sidebar" />}
    >
      <SessionBoundary guest={<SignInGate title={c("adminConsole")} description={c("signIn")} />}>
        {(accountId) => (
          <PermissionBoundary key={accountId} accountId={accountId} permission="admin.read">
            <Outlet />
          </PermissionBoundary>
        )}
      </SessionBoundary>
    </AppShell>
  );
}
