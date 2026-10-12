import { loadProject, createTask } from "../../lib/projects";
import { Plus } from "@phosphor-icons/react";
import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@voidmix/ui/page-header";
import { SectionHeading } from "@voidmix/ui/section-heading";
import { StatusBadge } from "@voidmix/ui/status-badge";
import { EmptyState } from "@voidmix/ui/empty-state";
import { Button } from "@voidmix/ui/components/ui/button";
import { Field, FieldLabel } from "@voidmix/ui/components/ui/field";
import { Input } from "@voidmix/ui/components/ui/input";
import { useDesktopTranslations, useFormatter } from "../../i18n/client";
import { ProjectUnavailable } from "../../features/shell/project-unavailable";

export const Route = createFileRoute("/projects/$projectId")({
  ssr: false,
  loader: async ({ params, abortController }) => {
    const result = await loadProject(params.projectId, abortController.signal);
    if (result.status === "loaded" && !result.data) throw notFound();
    return result;
  },
  component: ProjectDetailRoute,
  notFoundComponent: ProjectNotFound,
});

function ProjectDetailRoute() {
  const { projectId } = Route.useParams();
  return <ProjectDetail key={projectId} />;
}

function ProjectDetail() {
  const t = useDesktopTranslations("projects");
  const formatter = useFormatter();
  const errors = useDesktopTranslations("errors");
  const result = Route.useLoaderData();
  const project = result.data;
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const router = useRouter();
  const writable = project?.access === "write" || project?.access === "manage";
  async function submit() {
    if (!project || !writable || saving || !title.trim()) return;
    setSaving(true);
    setFailed(false);
    try {
      await createTask(project.id, title);
      await router.invalidate({ filter: (match) => match.routeId === Route.id, sync: true });
      setTitle("");
      setCreating(false);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="page project-detail-page flex flex-col gap-7 w-full max-w-350 m-auto p-8 [&_>_header_h1]:text-[24px] [&_h2]:text-[18px] [&_h2]:font-semibold [&_p]:wrap-anywhere [&_[data-slot=badge]]:text-[12px]">
      <nav
        aria-label={t("breadcrumb")}
        className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground"
      >
        <Link to="/projects">{t("backToProjects")}</Link>
        {project ? (
          <>
            <span aria-hidden="true">/</span>
            <span className="truncate">{project.title}</span>
          </>
        ) : null}
      </nav>
      {!project ? (
        <>
          <PageHeader title={t("title")} />
          {result.status === "unavailable" ? (
            <ProjectUnavailable result={result} routeId={Route.id} />
          ) : null}
        </>
      ) : (
        <>
          <PageHeader
            title={project.title}
            description={project.description ?? t("noDescription")}
            action={
              <StatusBadge
                label={t(project.stage)}
                tone={
                  project.stage === "delivered"
                    ? "success"
                    : project.stage === "draft"
                      ? "neutral"
                      : "info"
                }
              />
            }
          />
          <div className="project-detail-grid grid grid-cols-[minmax(0,_1fr)_288px] gap-8 items-start [@media(max-width:1120px)]:grid-cols-1">
            <section className="flex min-w-0 flex-col gap-5" aria-labelledby="tasks-heading">
              <SectionHeading
                titleId="tasks-heading"
                title={t("tasksCount", { count: project.tasks.length })}
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
              {creating ? (
                <form
                  className="flex flex-wrap items-end gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                  }}
                >
                  <Field className="min-w-0 flex-1">
                    <FieldLabel htmlFor="task-title">{t("taskPlaceholder")}</FieldLabel>
                    <Input
                      autoFocus
                      id="task-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      required
                      maxLength={500}
                      disabled={saving}
                    />
                  </Field>
                  <Button type="submit" disabled={!title.trim() || saving}>
                    {t(saving ? "saving" : "addTask")}
                  </Button>
                  {failed ? <p role="alert">{errors("unknown")}</p> : null}
                </form>
              ) : null}
              {!writable && project.tasks.length > 0 ? (
                <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
              ) : null}
              {!project.tasks.length ? (
                <EmptyState
                  title={t("emptyTasks")}
                  description={t(writable ? "taskPlaceholder" : "readOnly")}
                />
              ) : (
                <ul className="project-task-list border-y border-border [&_li]:flex [&_li]:items-center [&_li]:justify-between [&_li]:gap-4 [&_li]:py-4.5 [&_li]:px-0 [&_li]:border-b [&_li]:border-border [&_li:last-child]:border-b-0">
                  {project.tasks.map((task) => (
                    <li key={task.id}>
                      <span className="min-w-0 [overflow-wrap:anywhere]">{task.title}</span>
                      <StatusBadge
                        label={t(task.status)}
                        tone={
                          task.status === "done"
                            ? "success"
                            : task.status === "blocked"
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
              className="project-facts flex flex-col gap-5 border-l border-border pl-6 [&_dt]:text-muted-foreground [&_dt]:text-[12px] [&_dt]:mb-1 [&_dd]:wrap-anywhere [@media(max-width:1120px)]:order-[-1] [@media(max-width:1120px)]:grid [@media(max-width:1120px)]:grid-cols-2 [@media(max-width:1120px)]:pt-0 [@media(max-width:1120px)]:pb-5 [@media(max-width:1120px)]:px-0 [@media(max-width:1120px)]:border-l-0 [@media(max-width:1120px)]:border-b [@media(max-width:1120px)]:border-border"
              aria-label={t("projectInfo")}
            >
              <div>
                <dt>{t("ownership")}</dt>
                <dd>{t(project.organizationId ? "organization" : "personal")}</dd>
              </div>
              <div>
                <dt>{t("deadline")}</dt>
                <dd>
                  {project.deadline
                    ? formatter.dateTime(project.deadline, "short")
                    : t("noDeadline")}
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
        </>
      )}
    </div>
  );
}

function ProjectNotFound() {
  const t = useDesktopTranslations("projects");
  return (
    <div className="page flex flex-col gap-7 w-full max-w-350 m-auto p-8 [&_>_header_h1]:text-[24px] [&_h2]:text-[18px] [&_h2]:font-semibold [&_p]:wrap-anywhere [&_[data-slot=badge]]:text-[12px]">
      <Link to="/projects">{t("backToProjects")}</Link>
      <PageHeader title={t("missing")} />
    </div>
  );
}
