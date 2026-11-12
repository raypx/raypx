import { useTranslations } from "../../i18n.js";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { ShellProjectToolbar } from "@raypx/blocks/shell";
import { apiUrl, authClient } from "../auth/client.js";
import { taskClient } from "./client.js";
import { useProjectCatalog } from "./project-catalog.js";

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
    <ShellProjectToolbar
      name={name ?? (devices ? t("projectUnavailable") : c("loading"))}
      computer={remote ? computer : undefined}
    >
      <Link to="/tasks" search={search}>
        {c("tasks")}
      </Link>
      {!remote && (
        <Link to="/files" search={{ rootId: projectId }}>
          {c("files")}
        </Link>
      )}
      <Link to="/memory" search={{ ...search, scope: remote ? "account" : "local" }}>
        {t("projectReferences")}
      </Link>
      <Link to="/automations" search={{ ...search, scope: remote ? "cloud" : "local" }}>
        {t("projectAutomations")}
      </Link>
      {!remote && (
        <Link to="/terminal" search={{ project: projectId }}>
          {c("terminal")}
        </Link>
      )}
    </ShellProjectToolbar>
  );
}
