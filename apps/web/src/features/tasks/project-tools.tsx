import { useTranslations } from "../../i18n.js";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { ShellToolbar } from "@raypx/blocks/shell";
import { Tooltip, TooltipContent, TooltipTrigger } from "@raypx/ui/components/ui/tooltip";
import { ArrowLeftIcon } from "@raypx/icons/arrow-left";
import { FolderIcon } from "@raypx/icons/folder";
import { apiUrl, authClient } from "../auth/client.js";
import { taskClient } from "./client.js";

const tab =
  "relative flex h-full shrink-0 items-center px-2.5 text-sm whitespace-nowrap text-muted-foreground outline-none after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-[current=page]:font-medium aria-[current=page]:text-foreground aria-[current=page]:after:bg-foreground";

/** Web exposes only the project capabilities supported by the remote API. */
export function ProjectTools({
  projectId,
  deviceId,
}: {
  projectId: string;
  deviceId?: string | undefined;
}) {
  const t = useTranslations("tasks"),
    c = useTranslations("common");
  const session = authClient.useSession();
  const accountId = session.data?.user.id ?? null;
  // Shares the sidebar's project cache.
  const { data } = useQuery({
    queryKey: ["remote-projects", apiUrl, accountId],
    queryFn: ({ signal }) => taskClient.devices.list({}, { signal }),
    enabled: Boolean(accountId),
    retry: false,
  });
  const name = data
    ?.filter((device) => !deviceId || device?.id === deviceId)
    .flatMap((device) => device?.projects ?? [])
    .find((project) => project.id === projectId)?.name;
  const computer = deviceId ? data?.find((device) => device?.id === deviceId)?.name : undefined;
  const search = { project: projectId, ...(deviceId ? { device: deviceId } : {}) };
  return (
    <>
      <ShellToolbar>
        <Tooltip>
          <TooltipTrigger
            render={
              <Link
                to="/projects"
                aria-label={t("allProjects")}
                className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-[760px]:hidden"
              />
            }
          >
            <ArrowLeftIcon aria-hidden="true" className="size-4" />
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("allProjects")}</TooltipContent>
        </Tooltip>
        <span className="flex min-w-0 shrink-0 items-center gap-2 text-sm font-medium text-foreground">
          <FolderIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground max-[760px]:hidden"
          />
          <span className="max-w-40 truncate max-[760px]:max-w-24">
            {name ?? (data ? t("projectUnavailable") : c("loading"))}
          </span>
          {computer && (
            <span className="hidden max-w-40 truncate font-normal text-muted-foreground min-[900px]:inline">
              {computer}
            </span>
          )}
        </span>
        {deviceId && (
          <nav
            aria-label={c("projectTools")}
            className="flex h-full min-w-0 items-stretch overflow-x-auto [scrollbar-width:none]"
          >
            <Link to="/tasks" search={search} className={tab}>
              {c("tasks")}
            </Link>
            <Link to="/memory" search={search} className={tab}>
              {t("projectReferences")}
            </Link>
            <Link to="/automations" search={search} className={tab}>
              {t("projectAutomations")}
            </Link>
          </nav>
        )}
      </ShellToolbar>
      {!deviceId && (
        <p role="alert" className="mb-4 max-w-[65ch] text-sm text-destructive-text">
          {t("projectUnavailableHint")}
        </p>
      )}
    </>
  );
}
