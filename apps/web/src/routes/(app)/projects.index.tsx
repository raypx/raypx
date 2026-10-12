import { useState } from "react";
import { FolderSimple, Plus } from "@phosphor-icons/react";
import { Button } from "@voidmix/ui/components/ui/button";
import { Skeleton } from "@voidmix/ui/components/ui/skeleton";
import { Modal } from "@voidmix/ui/modal";
import { CreateTitleForm } from "../../features/projects/create-title-form";
import { ProjectStatus } from "../../features/projects/project-status";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { EmptyState } from "@voidmix/ui/empty-state";
import { PageHeader } from "@voidmix/ui/page-header";
import { useFormatter, useTranslations } from "../../i18n/client";
import { createRouteApiClient } from "../../lib/route-api";
import { RouteError, PageNavigation, pageSearch } from "../../features/navigation/route-state";

export const Route = createFileRoute("/(app)/projects/")({
  validateSearch: pageSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps, abortController, context }) => ({
    accountId: context.accountId,
    ...(await createRouteApiClient().projects.list(
      { limit: 50, ...deps },
      { signal: abortController.signal },
    )),
  }),
  pendingComponent: ProjectsPending,
  errorComponent: RouteError,
  component: ProjectsPage,
});

function ProjectsPage() {
  const t = useTranslations("projects");
  const formatter = useFormatter();
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const { items: projects, nextCursor } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  async function createProject(title: string) {
    await createRouteApiClient().projects.create({ title });
    await router.invalidate({ filter: (match) => match.routeId === Route.id, sync: true });
  }

  return (
    <div className="project-page flex flex-col gap-6 [&_h1]:text-[26px] [&_h1]:leading-[1.25] [&_h1]:tracking-[-0.025em] [@media(max-width:767px)]:[&_h1]:text-[24px]">
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={
          <Modal
            title={t("newProject")}
            description={t("createDescription")}
            closeLabel={t("close")}
            busy={saving}
            open={creating}
            onOpenChange={setCreating}
            trigger={
              <Button>
                <Plus data-icon="inline-start" />
                {t("newProject")}
              </Button>
            }
          >
            <CreateTitleForm
              kind="project"
              onCreate={async (title) => {
                setSaving(true);
                try {
                  await createProject(title);
                  setCreating(false);
                } finally {
                  setSaving(false);
                }
              }}
            />
          </Modal>
        }
      />
      {!projects.length ? (
        <div className="project-empty border border-border rounded-xl">
          <EmptyState
            icon={<FolderSimple aria-hidden="true" />}
            title={t("empty")}
            description={search.cursor ? t("emptyPage") : t("emptyDescription")}
          />
        </div>
      ) : (
        <section
          className="project-list border border-border rounded-[12px] bg-card"
          aria-label={t("projectList")}
        >
          <div
            className="project-columns [&_>_:last-child]:text-right grid grid-cols-[minmax(0,_1fr)_112px_96px_104px] items-center gap-5 p-5 py-3 text-muted-foreground text-[12px] border-b border-border [@media(max-width:1023px)]:grid-cols-[minmax(0,_1fr)_112px_92px] [@media(max-width:1023px)]:gap-4 [@media(max-width:1023px)]:[&_>_:nth-child(3)]:hidden [@media(max-width:767px)]:hidden"
            aria-hidden="true"
          >
            <span>{t("projectName")}</span>
            <span>{t("stage")}</span>
            <span>{t("ownership")}</span>
            <span>{t("updated")}</span>
          </div>
          {projects.map((project) => (
            <Link
              className="project-row grid grid-cols-[minmax(0,_1fr)_112px_96px_104px] items-center gap-5 p-5 border-b border-border [transition:background-color_150ms] [&:last-child]:border-b-0 [&:last-child]:rounded-[0_0_12px_12px] [&:hover]:bg-muted [&:focus-visible]:[outline-offset:-3px]! [@media(max-width:1023px)]:grid-cols-[minmax(0,_1fr)_112px_92px] [@media(max-width:1023px)]:gap-4 [@media(max-width:1023px)]:relative [@media(max-width:1023px)]:gap-y-1.5 [@media(max-width:767px)]:grid-cols-[minmax(0,_1fr)_auto] [@media(max-width:767px)]:gap-2.5 [@media(max-width:767px)]:p-4 [@media(max-width:767px)]:[&:first-of-type]:rounded-[12px_12px_0_0] [@media(max-width:767px)]:[&_>_span:not(.project-owner)]:[grid-column:1] [@media(max-width:767px)]:[&_>_span:not(.project-owner)]:[grid-row:2] [@media(max-width:767px)]:[&_>_span:not(.project-owner)]:ml-12"
              key={project.id}
              to="/projects/$projectId"
              params={{ projectId: project.id }}
            >
              <div className="project-identity flex items-center gap-3 min-w-0 [&_h2]:truncate [&_h2]:text-[14px] [&_h2]:font-semibold [&_p]:mt-1 [&_p]:text-muted-foreground [&_p]:text-[12px] [@media(max-width:767px)]:[grid-column:1_/_-1]">
                <span className="project-icon grid [place-items:center] shrink-0 size-9 border border-border rounded-[8px] text-muted-foreground [&_svg]:size-4.5">
                  <FolderSimple aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 title={project.title}>{project.title}</h2>
                  <p className="line-clamp-1">{project.description ?? t("noDescription")}</p>
                </div>
              </div>
              <ProjectStatus stage={project.stage} />
              <span className="project-owner text-xs text-muted-foreground [@media(max-width:1023px)]:[grid-column:1] [@media(max-width:1023px)]:pl-12 [@media(max-width:767px)]:pl-12 [@media(max-width:767px)]:[grid-row:3]">
                {t(project.organizationId ? "organization" : "personal")}
              </span>
              <time
                className="project-updated text-xs text-muted-foreground text-right tabular-nums [@media(max-width:1023px)]:[grid-column:3] [@media(max-width:1023px)]:[grid-row:1_/_3] [@media(max-width:767px)]:[grid-column:2] [@media(max-width:767px)]:[grid-row:3]"
                dateTime={project.updatedAt.toISOString()}
              >
                {formatter.dateTime(project.updatedAt, "short")}
              </time>
            </Link>
          ))}
        </section>
      )}
      <PageNavigation
        cursor={search.cursor}
        nextCursor={nextCursor}
        onNavigate={(cursor) => void navigate({ search: cursor ? { cursor } : {} })}
      />
    </div>
  );
}

function ProjectsPending() {
  const t = useTranslations("projects");
  const navigation = useTranslations("navigation");
  return (
    <div
      className="project-page flex flex-col gap-6 [&_h1]:text-[26px] [&_h1]:leading-[1.25] [&_h1]:tracking-[-0.025em] [@media(max-width:767px)]:[&_h1]:text-[24px]"
      aria-busy="true"
    >
      <PageHeader title={t("title")} description={t("description")} />
      <div
        role="status"
        aria-label={navigation("loading")}
        className="project-skeleton border-y border-border [&_>_div]:grid [&_>_div]:grid-cols-[minmax(0,_1fr)_80px_80px] [&_>_div]:gap-6 [&_>_div]:py-7 [&_>_div]:px-5 [&_>_div]:border-b [&_>_div]:border-border [&_[data-slot=skeleton]]:h-3.5 [&_[data-slot=skeleton]]:rounded-[4px] [&_[data-slot=skeleton]]:bg-muted [@media(max-width:767px)]:[&_>_div]:grid-cols-[minmax(0,_1fr)_64px] [@media(max-width:767px)]:[&_[data-slot=skeleton]:last-child]:hidden"
      >
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} aria-hidden="true">
            <Skeleton className="h-3.5" />
            <Skeleton className="h-3.5" />
            <Skeleton className="h-3.5" />
          </div>
        ))}
      </div>
    </div>
  );
}
