import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { AgentCapability, DeviceProject } from "@raypx/contracts/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { LoadingState } from "@raypx/ui/loading-state";
import { Check, FolderOpen, RefreshCw } from "lucide-react";
import { isDesktop, localRequest, pickDirectory } from "../../lib/desktop";

export function LocalWelcome() {
  const t = useTranslations("localWorkspace"),
    tasks = useTranslations("tasks"),
    c = useTranslations("common");
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const setup = useQuery({
    queryKey: ["local-onboarding"],
    enabled: isDesktop(),
    retry: false,
    queryFn: async () => {
      const [projects, agents] = await Promise.all([
        localRequest<DeviceProject[]>("agents.projects", {}),
        localRequest<AgentCapability[]>("agents.capabilities", {}),
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
        await localRequest("agents.configure", { rootId: root.id, providers: ["claude", "codex"] });
        await setup.refetch();
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto max-w-240">
      <header className="mb-9">
        <p className="mb-3 text-sm text-muted-foreground">{t("localMode")}</p>
        <h1>{t("welcome")}</h1>
        <p className="mt-3 max-w-[65ch] text-muted-foreground">{t("welcomeHint")}</p>
      </header>
      {!isDesktop() && <p className="mb-5 text-sm text-muted-foreground">{c("desktopOnly")}</p>}
      {setup.isLoading && <LoadingState label={c("loading")} />}
      <ol className="divide-y divide-border border-y border-border">
        <li className="grid gap-4 py-6 sm:grid-cols-[2rem_1fr]">
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-full border border-border text-sm"
          >
            {configured ? <Check className="size-4" /> : "1"}
          </span>
          <div>
            <h2 className="text-base font-semibold">{t("chooseProject")}</h2>
            <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">{t("projectHint")}</p>
            {setup.data?.projects.map((project) => (
              <p key={project.id} className="mt-2 break-words text-sm">
                {project.name}
              </p>
            ))}
            <Button
              className="mt-4"
              variant="outline"
              disabled={busy || !isDesktop()}
              onClick={() => void chooseProject()}
            >
              <FolderOpen className="size-4" />
              {t(busy ? "authorizing" : configured ? "chooseAnotherProject" : "chooseProject")}
            </Button>
          </div>
        </li>
        <li className="grid gap-4 py-6 sm:grid-cols-[2rem_1fr]">
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-full border border-border text-sm"
          >
            {available ? <Check className="size-4" /> : "2"}
          </span>
          <div>
            <h2 className="text-base font-semibold">{t("checkAgent")}</h2>
            <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">{t("agentHint")}</p>
            <ul className="mt-3 space-y-2">
              {setup.data?.agents.map((agent) => (
                <li key={agent.provider} className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  <span>{agent.provider === "claude" ? "Claude Code" : "Codex"}</span>
                  <span className="text-muted-foreground">{tasks(agent.reason)}</span>
                </li>
              ))}
            </ul>
            <Button
              className="mt-4"
              variant="outline"
              disabled={busy || setup.isFetching || !isDesktop()}
              onClick={() => void setup.refetch()}
            >
              <RefreshCw className="size-4" />
              {t("checkAgain")}
            </Button>
          </div>
        </li>
        <li className="grid gap-4 py-6 sm:grid-cols-[2rem_1fr]">
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-full border border-border text-sm"
          >
            3
          </span>
          <div>
            <h2 className="text-base font-semibold">{t("firstTask")}</h2>
            <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">{t("firstTaskHint")}</p>
            <Button
              className="mt-4"
              disabled={!configured || !available || busy}
              onClick={() => void navigate({ to: "/tasks", search: { scope: "local" } })}
            >
              {t("writeTask")}
            </Button>
          </div>
        </li>
      </ol>
      {(error || setup.isError) && (
        <p role="alert" className="mt-4 text-sm text-destructive-text">
          {tasks("LOCAL_UNAVAILABLE")}
        </p>
      )}
      <p className="mt-6 max-w-[75ch] text-sm text-muted-foreground">{t("ownershipHint")}</p>
      <div className="mt-5 flex flex-wrap gap-5 text-sm">
        <Link to="/terminal" className="underline underline-offset-4">
          {t("exploreLocal")}
        </Link>
        <Link to="/settings" className="underline underline-offset-4">
          {t("remoteLater")}
        </Link>
      </div>
    </section>
  );
}
