import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "@raypx/i18n/browser";
import { ShellToolbar } from "@raypx/blocks/shell";
import { FolderIcon } from "@raypx/icons/folder";
import { apiUrl, authClient } from "../auth/client.ts";
import { taskClient } from "./client.ts";
import { useProjectCatalog } from "./project-catalog.ts";

const tab =
  "relative flex h-full shrink-0 items-center px-2.5 text-sm whitespace-nowrap text-muted-foreground outline-none after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-[current=page]:font-medium aria-[current=page]:text-foreground aria-[current=page]:after:bg-foreground";

/** The project name and its tools live in the shell top bar on every project page. */
export function ProjectTools({
  projectId,
  deviceId,
  remote = false,
}: {
  projectId: string;
  deviceId?: string;
  remote?: boolean;
}) {
  const c = useTranslations("common"),
    t = useTranslations("tasks");
  const session = authClient.useSession();
  const accountId = session.data?.user.id ?? null;
  // Share the sidebar's caches so the name never needs its own request.
  const local = useProjectCatalog(!remote);
  const connected = useQuery({
    queryKey: ["desktop-remote-projects", apiUrl, accountId],
    queryFn: ({ signal }) => taskClient.devices.list({}, { signal }),
    enabled: remote && Boolean(accountId),
    retry: false,
  });
  const devices = remote ? connected.data : local.data;
  const name = devices
    ?.filter((device) => !deviceId || device?.id === deviceId)
    .flatMap((device) => device?.projects ?? [])
    .find((project) => project.id === projectId)?.name;
  const computer = deviceId ? devices?.find((device) => device?.id === deviceId)?.name : undefined;
  const search = {
    scope: remote ? "remote" : "local",
    project: projectId,
    ...(deviceId ? { device: deviceId } : {}),
  } as const;
  return (
    <ShellToolbar>
      <span className="flex min-w-0 shrink-0 items-center gap-2 text-sm font-medium text-foreground">
        <FolderIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground max-[760px]:hidden"
        />
        <span className="max-w-40 truncate max-[760px]:max-w-24">
          {name ?? (devices ? t("projectUnavailable") : c("loading"))}
        </span>
        {remote && computer && (
          <span className="hidden max-w-40 truncate font-normal text-muted-foreground min-[900px]:inline">
            {computer}
          </span>
        )}
      </span>
      <nav
        aria-label={c("projectTools")}
        className="flex h-full min-w-0 items-stretch overflow-x-auto [scrollbar-width:none]"
      >
        <Link className={tab} to="/tasks" search={search}>
          {c("tasks")}
        </Link>
        {!remote && (
          <Link className={tab} to="/files" search={{ rootId: projectId }}>
            {c("files")}
          </Link>
        )}
        <Link
          className={tab}
          to="/memory"
          search={{ ...search, scope: remote ? "account" : "local" }}
        >
          {t("projectReferences")}
        </Link>
        <Link
          className={tab}
          to="/automations"
          search={{ ...search, scope: remote ? "cloud" : "local" }}
        >
          {t("projectAutomations")}
        </Link>
        {!remote && (
          <Link className={tab} to="/terminal" search={{ project: projectId }}>
            {c("terminal")}
          </Link>
        )}
      </nav>
    </ShellToolbar>
  );
}
