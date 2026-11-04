import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LoadingState } from "@raypx/ui/loading-state";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@raypx/ui/components/ui/empty";
import { useLocalProjectContext } from "../tasks/project-context";
import { LocalWelcome } from "./welcome";
import { useDesktopPlatform } from "../../lib/platform-context";

export function LocalHome() {
  const navigate = useNavigate(),
    context = useLocalProjectContext();
  const platform = useDesktopPlatform();
  const c = useTranslations("common"),
    t = useTranslations("tasks"),
    local = useTranslations("localWorkspace");
  useEffect(() => {
    if (context.selectionInvalid || !context.project || !context.device) return;
    void navigate({
      to: "/tasks",
      search: { scope: "local", project: context.project.id, device: context.device.id },
      replace: true,
    });
  }, [context.project, context.device, context.selectionInvalid, navigate]);
  if (context.isError && !context.data)
    return (
      <Empty role="alert">
        <EmptyHeader>
          <EmptyTitle>{t("projectsUnavailable")}</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={() => void context.refetch()}>
            {c("retry")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  if (context.selectionInvalid)
    return (
      <Empty role="alert">
        <EmptyHeader>
          <EmptyTitle>{t("projectUnavailable")}</EmptyTitle>
          <EmptyDescription>{local("projectMissing")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} render={<Link to="/" />}>
            {local("selectProject")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  if (!platform.isDesktop()) return <LocalWelcome />;
  if (context.isPending || context.project) return <LoadingState label={c("loading")} />;
  return <LocalWelcome />;
}
