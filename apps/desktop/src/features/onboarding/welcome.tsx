import { agentProviderMetadata, agentProviders } from "@raypx/core/tasks";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";

import { useTranslations } from "@raypx/i18n/browser";
import { Button, buttonVariants } from "@raypx/ui/components/ui/button";
import { LoadingState } from "@raypx/ui/loading-state";
import { cn } from "@raypx/ui/lib/utils";
import { CheckIcon } from "@raypx/icons/check";
import { FolderOpenIcon } from "@raypx/icons/folder-open";
import { EditIcon } from "@raypx/icons/edit";
import { RefreshIcon } from "@raypx/icons/refresh";
import { SettingsIcon } from "@raypx/icons/settings";
import { TerminalWindowIcon } from "@raypx/icons/terminal-window";
import { useDesktopPlatform } from "../../lib/platform-context.tsx";
import { useProjectCatalog, projectCatalogKey } from "../tasks/project-catalog.ts";
import { recentProjects, rememberProject } from "../tasks/project-history.ts";
import { useSettingsNavigation } from "../settings/navigation.ts";

export function LocalWelcome() {
  const { isDesktop, localRequest, pickDirectory } = useDesktopPlatform();
  const t = useTranslations("localWorkspace"),
    tasks = useTranslations("tasks"),
    c = useTranslations("common");
  const navigate = useNavigate();
  const settings = useSettingsNavigation();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const catalog = useProjectCatalog();
  const agents = useQuery({
    queryKey: ["desktop-agent-capabilities"],
    enabled: isDesktop(),
    retry: false,
    queryFn: () => localRequest("agents.capabilities", {}),
  });
  const projects = catalog.data?.[0]?.projects ?? [];
  const configured = projects.length > 0;
  const available = agents.data?.some((agent) => agent.available) ?? false;
  async function chooseProject() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const root = await pickDirectory();
      if (root) {
        await localRequest("agents.configure", { rootId: root.id, providers: [...agentProviders] });
        rememberProject(root.id);
        await queryClient.invalidateQueries({ queryKey: projectCatalogKey });
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  const projectId =
    projects.find((project) => project.id === recentProjects()[0])?.id ?? projects[0]?.id;
  const steps = [
    {
      done: configured,
      title: t("chooseProject"),
      hint: t("projectHint"),
      detail: projects.length ? (
        <p className="mt-1 text-sm break-words">
          {projects.map((project) => project.name).join(" · ")}
        </p>
      ) : undefined,
      action: (
        <Button
          variant={configured ? "outline" : "default"}
          disabled={busy || catalog.isPending || !isDesktop()}
          onClick={() => void chooseProject()}
        >
          <FolderOpenIcon aria-hidden="true" />
          {t(busy ? "authorizing" : configured ? "chooseAnotherProject" : "chooseProject")}
        </Button>
      ),
    },
    {
      done: available,
      title: t("checkAgent"),
      hint: t("agentHint"),
      detail: agents.data?.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {agents.data.map((agent) => (
            <li
              key={agent.provider}
              className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full",
                  agent.available ? "bg-foreground" : "bg-muted-foreground/40",
                )}
              />
              <span>{agentProviderMetadata[agent.provider].label}</span>
              <span className="text-muted-foreground">{tasks(agent.reason)}</span>
            </li>
          ))}
        </ul>
      ) : undefined,
      action: (
        <Button
          variant={configured && !available ? "default" : "outline"}
          disabled={busy || agents.isFetching || !isDesktop()}
          onClick={() => void agents.refetch()}
        >
          <RefreshIcon aria-hidden="true" />
          {t("checkAgain")}
        </Button>
      ),
    },
    {
      done: false,
      title: t("firstTask"),
      hint: t("firstTaskHint"),
      detail: undefined,
      action: (
        <Button
          variant={configured && available ? "default" : "outline"}
          disabled={!configured || !available || busy}
          onClick={() =>
            void navigate({
              to: "/tasks",
              search: {
                scope: "local",
                ...(projectId ? { project: projectId } : {}),
                ...(catalog.data?.[0] ? { device: catalog.data[0].id } : {}),
              },
            })
          }
        >
          <EditIcon aria-hidden="true" />
          {t("writeTask")}
        </Button>
      ),
    },
  ];
  return (
    <section className="mx-auto max-w-200">
      <header className="mb-6">
        <h1>{t("welcome")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("welcomeHint")}</p>
      </header>
      {!isDesktop() && <p className="mb-5 text-sm text-muted-foreground">{c("desktopOnly")}</p>}
      {(catalog.isLoading || agents.isLoading) && <LoadingState label={c("loading")} />}
      <ol className="divide-y divide-border rounded-xl border border-border">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 p-5 @2xl/main:grid-cols-[2rem_minmax(0,1fr)_auto]"
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-8 items-center justify-center rounded-full border border-border text-sm tabular-nums",
                step.done && "border-foreground bg-foreground text-background",
              )}
            >
              {step.done ? <CheckIcon className="size-4" /> : index + 1}
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold">{step.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{step.hint}</p>
              {step.detail}
            </div>
            <div className="col-start-2 @2xl/main:col-start-3">{step.action}</div>
          </li>
        ))}
      </ol>
      {(error || catalog.isError) && (
        <p role="alert" className="mt-4 text-sm text-destructive-text">
          {tasks("projectsUnavailable")}
        </p>
      )}
      {catalog.isError && (
        <Button variant="outline" onClick={() => void catalog.refetch()}>
          {c("retry")}
        </Button>
      )}
      {agents.isError && (
        <p role="alert" className="mt-4 text-sm text-destructive-text">
          {t("agentUnavailable")}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Link to="/terminal" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
          <TerminalWindowIcon aria-hidden="true" />
          {t("exploreLocal")}
        </Link>
        <Button
          variant="ghost"
          size="sm"
          aria-haspopup="dialog"
          onClick={() => void settings.open()}
        >
          <SettingsIcon aria-hidden="true" />
          {t("remoteLater")}
        </Button>
      </div>
    </section>
  );
}
