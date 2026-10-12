import { useSuspenseQuery } from "@tanstack/react-query";
import { cloudQueries } from "../../lib/cloud-queries";
import { useCloudQueries } from "../../lib/use-cloud-queries";
import { useEffect, useRef, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { CreateTitleForm } from "../../features/projects/create-title-form";
import { taskLabels } from "../../features/conversations/labels";
import { ProjectStatus } from "../../features/projects/project-status";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@voidmix/ui/components/ui/button";
import { EmptyState } from "@voidmix/ui/empty-state";
import { PageHeader } from "@voidmix/ui/page-header";
import { SectionHeading } from "@voidmix/ui/section-heading";
import { StatusBadge } from "@voidmix/ui/status-badge";
import { useFormatter, useTranslations } from "../../i18n/client";
import { createRouteApiClient } from "../../lib/route-api";
import { RoutePending, RouteError } from "../../features/navigation/route-state";

export const Route = createFileRoute("/(app)/projects/$projectId")({
  loader: async ({ params, context }) => {
    const queries = cloudQueries(context, createRouteApiClient());
    const [project] = await Promise.all([
      context.queryClient.ensureQueryData(queries.project(params.projectId)),
      context.queryClient.ensureQueryData(queries.tasks(undefined, params.projectId)),
    ]);
    if (project.access === "manage")
      await Promise.all([
        context.queryClient.ensureQueryData(queries.members(params.projectId)),
        context.queryClient.ensureQueryData(queries.spendingGrants(params.projectId)),
      ]);
    return { accountId: context.accountId };
  },
  pendingComponent: RoutePending,
  errorComponent: RouteError,
  component: ProjectDetailRoute,
});

function ProjectDetailRoute() {
  const { projectId } = Route.useParams();
  return <ProjectDetail key={projectId} projectId={projectId} />;
}

function ProjectDetail({ projectId }: { projectId: string }) {
  const t = useTranslations("projects");
  const cloud = useTranslations("cloud");
  const statuses = taskLabels(cloud);
  const formatter = useFormatter();
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const { api, queries, queryClient } = useCloudQueries();
  const { data: result } = useSuspenseQuery(queries.project(projectId));
  const {
    data: { items: tasks },
  } = useSuspenseQuery(queries.tasks(undefined, projectId));
  async function createTask(title: string) {
    setSaving(true);
    try {
      await api.cloud.tasks.create({
        projectId,
        title,
        goal: title,
        idempotencyKey: crypto.randomUUID(),
      });
      await queryClient.invalidateQueries({
        queryKey: queries.tasks(undefined, projectId).queryKey,
        exact: true,
      });
      setCreating(false);
    } finally {
      setSaving(false);
    }
  }

  const { project, access } = result;
  const writable = access === "write" || access === "manage";
  return (
    <div className="project-page flex flex-col gap-6 [&_h1]:text-[26px] [&_h1]:leading-[1.25] [&_h1]:tracking-[-0.025em] [@media(max-width:767px)]:[&_h1]:text-[24px]">
      <nav
        aria-label={t("breadcrumb")}
        className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground"
      >
        <Link to="/projects">{t("title")}</Link>
        <span aria-hidden="true">/</span>
        <span className="truncate">{project.title}</span>
      </nav>
      <PageHeader
        title={project.title}
        description={project.description ?? t("noDescription")}
        action={<ProjectStatus stage={project.stage} />}
      />
      <div className="project-detail-grid grid grid-cols-[minmax(0,_1fr)_288px] items-start gap-8 [@media(max-width:1023px)]:grid-cols-1">
        <section className="flex min-w-0 flex-col gap-5" aria-labelledby="tasks-heading">
          <SectionHeading
            titleId="tasks-heading"
            title={t("tasksCount", { count: tasks.length })}
            action={
              writable ? (
                <Button
                  variant="outline"
                  disabled={saving}
                  aria-expanded={creating}
                  onClick={() => setCreating(!creating)}
                >
                  <Plus data-icon="inline-start" />
                  {t(creating ? "close" : "addTask")}
                </Button>
              ) : undefined
            }
          />
          {creating && writable ? <CreateTitleForm kind="task" onCreate={createTask} /> : null}
          {!writable && tasks.length > 0 ? (
            <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
          ) : null}
          {!tasks.length ? (
            <EmptyState
              title={t("emptyTasks")}
              description={t(writable ? "taskPlaceholder" : "readOnly")}
            />
          ) : (
            <ul className="project-task-list border-y border-border [&_li]:flex [&_li]:items-center [&_li]:justify-between [&_li]:gap-4 [&_li]:py-4.5 [&_li]:px-0 [&_li]:border-b [&_li]:border-border [&_li:last-child]:border-b-0">
              {tasks.map((task) => (
                <li key={task.id}>
                  <Link
                    to="/tasks/$taskId"
                    params={{ taskId: task.id }}
                    className="min-w-0 [overflow-wrap:anywhere] hover:underline"
                  >
                    {task.title}
                  </Link>
                  <StatusBadge
                    label={statuses[task.status]}
                    tone={
                      task.status === "completed"
                        ? "success"
                        : task.status === "waiting_input"
                          ? "warning"
                          : task.status === "in_progress"
                            ? "info"
                            : "neutral"
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
        <dl
          className="project-facts flex flex-col gap-5 border-l border-border pl-6 [&_dt]:text-muted-foreground [&_dt]:text-[12px] [&_dt]:mb-1 [&_dd]:wrap-anywhere [@media(max-width:1023px)]:order-[-1] [@media(max-width:1023px)]:grid [@media(max-width:1023px)]:grid-cols-2 [@media(max-width:1023px)]:border-l-0 [@media(max-width:1023px)]:border-b [@media(max-width:1023px)]:border-border [@media(max-width:1023px)]:pt-0 [@media(max-width:1023px)]:pb-5 [@media(max-width:1023px)]:px-0"
          aria-label={t("projectInfo")}
        >
          <div>
            <dt>{t("ownership")}</dt>
            <dd>{t(project.organizationId ? "organization" : "personal")}</dd>
          </div>
          <div>
            <dt>{t("deadline")}</dt>
            <dd>
              {project.deadline ? formatter.dateTime(project.deadline, "short") : t("noDeadline")}
            </dd>
          </div>
          <div>
            <dt>{t("updated")}</dt>
            <dd>{formatter.dateTime(project.updatedAt, "short")}</dd>
          </div>
          <div>
            <dt>{t("created")}</dt>
            <dd>{formatter.dateTime(project.createdAt, "short")}</dd>
          </div>
        </dl>
      </div>
      <Link to="/chat" className="text-sm underline">
        {t("startCloudConversation")}
      </Link>
      {access === "manage" ? <SpendingGrants projectId={projectId} /> : null}
    </div>
  );
}

/** One-route management surface: membership and permission defaults remain server-owned. */
function SpendingGrants({ projectId }: { projectId: string }) {
  const t = useTranslations("cloud");
  const { api, identity, queries, queryClient } = useCloudQueries();
  const { data: members } = useSuspenseQuery(queries.members(projectId));
  const { data: grants } = useSuspenseQuery(queries.spendingGrants(projectId));
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  const intents = useRef(new Map<string, string>());
  const rows = [
    ...new Set([
      identity.actorId,
      ...members.items
        .filter((member) => member.status === "active")
        .map((member) => member.userId),
      ...grants.items.map((grant) => grant.userId),
    ]),
  ];
  useEffect(() => {
    lifetime.current = new AbortController();
    return () => lifetime.current?.abort();
  }, []);
  async function change(userId: string, allowed: boolean) {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || pending) return;
    const fingerprint = JSON.stringify([userId, allowed]);
    const idempotencyKey = intents.current.get(fingerprint) ?? crypto.randomUUID();
    intents.current.set(fingerprint, idempotencyKey);
    setPending(userId);
    setFailed(false);
    try {
      await api.cloud.tasks.setSpendingGrant(
        { projectId, userId, allowed, idempotencyKey },
        { signal },
      );
      if (signal.aborted) return;
      intents.current.delete(fingerprint);
      await queryClient.invalidateQueries({
        queryKey: queries.spendingGrants(projectId).queryKey,
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: queries.capabilities().queryKey,
        exact: true,
      });
    } catch {
      if (!signal.aborted) setFailed(true);
    } finally {
      if (!signal.aborted) setPending(null);
    }
  }
  return (
    <section className="space-y-4 border-t border-border pt-6" aria-label={t("spendingGrants")}>
      <h2 className="text-lg font-semibold">{t("spendingGrants")}</h2>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        {t("spendingDescription")}
      </p>
      {failed ? (
        <p role="alert" className="text-sm">
          {t("failed")}
        </p>
      ) : null}
      <ul className="divide-y divide-border">
        {rows.map((userId) => {
          const grant = grants.items.find((item) => item.userId === userId);
          return (
            <li key={userId} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="min-w-0">
                <p className="text-sm wrap-anywhere">
                  {userId === identity.actorId ? t("yourSpending") : userId}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(
                    grant
                      ? grant.allowed
                        ? "spendingAllowed"
                        : "spendingDenied"
                      : "spendingInherited",
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={Boolean(pending) || grant?.allowed === true}
                  onClick={() => void change(userId, true)}
                >
                  {pending === userId ? t("pending") : t("allowSpending")}
                </Button>
                <Button
                  variant="outline"
                  disabled={Boolean(pending) || grant?.allowed === false}
                  onClick={() => void change(userId, false)}
                >
                  {t("revokeSpending")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
