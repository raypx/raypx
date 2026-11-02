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
import { isDesktop, localRequest, pickDirectory } from "../../lib/desktop";
import { recentProjects, rememberProject } from "../tasks/project-history";

export function LocalWelcome() {
  const t = useTranslations("localWorkspace"),
    tasks = useTranslations("tasks"),
    c = useTranslations("common");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const setup = useQuery({
    queryKey: ["local-onboarding"],
    enabled: isDesktop(),
    retry: false,
    queryFn: async () => {
      const [projects, agents] = await Promise.all([
        localRequest("agents.projects", {}),
        localRequest("agents.capabilities", {}),
      ]);
      return { projects, agents };
    },
  });
  const configured = Boolean(setup.data?.projects.length);
  const available = setup.data?.agents.some((agent) => agent.available) ?? false;
  async function chooseProject() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const root = await pickDirectory();
      if (root) {
        await localRequest("agents.configure", { rootId: root.id, providers: [...agentProviders] });
        rememberProject(root.id);
        await setup.refetch();
        await queryClient.invalidateQueries({ queryKey: ["desktop-project-navigation"] });
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  const projectId =
    setup.data?.projects.find((project) => project.id === recentProjects()[0])?.id ??
    setup.data?.projects[0]?.id;
  const steps = [
    {
      done: configured,
      title: t("chooseProject"),
      hint: t("projectHint"),
      detail: setup.data?.projects.length ? (
        <p className="mt-1 text-sm break-words">
          {setup.data.projects.map((project) => project.name).join(" · ")}
        </p>
      ) : undefined,
      action: (
        <Button
          variant="outline"
          disabled={busy || !isDesktop()}
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
      detail: setup.data?.agents.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {setup.data.agents.map((agent) => (
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
          variant="outline"
          disabled={busy || setup.isFetching || !isDesktop()}
          onClick={() => void setup.refetch()}
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
          disabled={!configured || !available || busy}
          onClick={() =>
            void navigate({
              to: "/tasks",
              search: { scope: "local", ...(projectId ? { project: projectId } : {}) },
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
      {setup.isLoading && <LoadingState label={c("loading")} />}
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
      {(error || setup.isError) && (
        <p role="alert" className="mt-4 text-sm text-destructive-text">
          {tasks("LOCAL_UNAVAILABLE")}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Link to="/terminal" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
          <TerminalWindowIcon aria-hidden="true" />
          {t("exploreLocal")}
        </Link>
        <Link to="/settings" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
          <SettingsIcon aria-hidden="true" />
          {t("remoteLater")}
        </Link>
      </div>
    </section>
  );
}
