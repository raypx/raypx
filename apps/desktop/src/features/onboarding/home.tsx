import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { useLocalProjectContext } from "../tasks/project-context.js";
import { LocalWelcome } from "./welcome.js";
import { useDesktopPlatform } from "../../lib/platform-context.js";

export function LocalHome() {
  const context = useLocalProjectContext();
  const platform = useDesktopPlatform();
  const c = useTranslations("common"),
    t = useTranslations("tasks"),
    local = useTranslations("localWorkspace");
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
  if (context.isPending) return <LoadingState label={c("loading")} />;
  return <LocalHomeEntry context={context} />;
}

function LocalHomeEntry({ context }: { context: ReturnType<typeof useLocalProjectContext> }) {
  const navigate = useNavigate();
  const c = useTranslations("common");
  // Capture the first loaded catalog. Authorizing a first project later must not skip setup.
  const [restore] = useState(() =>
    context.project && context.device
      ? { project: context.project.id, device: context.device.id }
      : null,
  );
  useEffect(() => {
    if (restore)
      void navigate({
        to: "/tasks",
        search: { scope: "local", ...restore },
        hash: true,
        replace: true,
      });
  }, [restore, navigate]);
  return restore ? <LoadingState label={c("loading")} /> : <LocalWelcome />;
}
