import { DirectoryProvider } from "../../../features/admin/users/store-provider";
import { directorySearch } from "../../../features/admin/users/search";
import { createApiUsersAdapter } from "../../../features/admin/users/api-adapter";
import { createRouteApiClient } from "../../../lib/route-api";
import { useSession } from "../../../lib/auth-client";
import { RoutePending, RouteError } from "../../../features/navigation/route-state";
import { createFileRoute, useRouter, useLocation } from "@tanstack/react-router";
import { PageHeader } from "@voidmix/ui/page-header";

import { UserDirectory } from "../../../features/admin/users/directory";
import { useTranslations } from "../../../i18n/client";
import { localizedRouteHead } from "../../../i18n/route-meta";

export const Route = createFileRoute("/(app)/(admin)/admin")({
  validateSearch: directorySearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps, abortController, context }) => ({
    accountId: context.accountId,
    ...(await createApiUsersAdapter(createRouteApiClient()).listUsers(
      { ...deps, limit: 50 },
      abortController.signal,
    )),
  }),
  pendingComponent: RoutePending,
  errorComponent: RouteError,
  component: AdminUsersRoute,
  head: ({ matches }) => localizedRouteHead(matches, "adminTitle", "adminDescription"),
});

function AdminUsersRoute() {
  const t = useTranslations("admin");
  const page = Route.useLoaderData();
  const search = directorySearch(useLocation({ select: (location) => location.search }));
  const navigate = Route.useNavigate();
  const router = useRouter();
  const session = useSession();
  return (
    <div className="project-page flex flex-col gap-6 [&_h1]:text-[26px] [&_h1]:leading-[1.25] [&_h1]:tracking-[-0.025em] [@media(max-width:767px)]:[&_h1]:text-[24px]">
      <PageHeader
        title={t("userDirectory")}
        description={t("userDirectoryDescription")}
        action={
          <span className="text-sm text-muted-foreground">
            {t("matchingUsers", { count: page.total })}
          </span>
        }
      />
      <DirectoryProvider key={session.data?.user.id ?? "anonymous"}>
        <UserDirectory
          page={page}
          search={search}
          onSearch={(patch) =>
            void navigate({
              search: directorySearch({ ...search, ...patch }),
              replace: !("cursor" in patch && patch.cursor),
            })
          }
          reload={async () => {
            await router.invalidate({ filter: (match) => match.routeId === Route.id, sync: true });
          }}
        />
      </DirectoryProvider>
    </div>
  );
}
