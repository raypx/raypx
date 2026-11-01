import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LoadingState } from "@raypx/ui/loading-state";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { useLocalProjectContext } from "../../features/tasks/project-context";
import { LocalWelcome } from "../../features/onboarding/welcome";
import { isDesktop } from "../../lib/desktop";

export const Route = createFileRoute("/(local)/")({
  staticData: { page: { title: "common.projects", layout: "workbench" } },
  component: LocalHome,
});
function LocalHome() {
  const navigate = useNavigate(),
    context = useLocalProjectContext();
  const c = useTranslations("common"),
    t = useTranslations("tasks");
  useEffect(() => {
    if (!context.project || !context.device) return;
    void navigate({
      to: "/tasks",
      search: { scope: "local", project: context.project.id, device: context.device.id },
      replace: true,
    });
  }, [context.project, context.device, navigate]);
  if (context.isError)
    return (
      <div role="alert">
        <p>{t("LOCAL_UNAVAILABLE")}</p>
        <Button variant="outline" onClick={() => void context.refetch()}>
          {c("retry")}
        </Button>
      </div>
    );
  if (!isDesktop()) return <LocalWelcome />;
  if (context.isPending || context.project) return <LoadingState label={c("loading")} />;
  return <LocalWelcome />;
}
