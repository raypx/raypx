import { useTranslations } from "../../i18n.js";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { ShellProjectToolbar } from "@raypx/blocks/shell";
import { IconButton } from "@raypx/ui/icon-button";
import { ArrowLeftIcon } from "@raypx/icons/arrow-left";
import { apiUrl, authClient } from "../auth/client.js";
import { taskClient } from "./client.js";

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
      <ShellProjectToolbar
        name={name ?? (data ? t("projectUnavailable") : c("loading"))}
        computer={computer}
        back={
          <IconButton
            label={t("allProjects")}
            render={<Link to="/projects" />}
            nativeButton={false}
            role="link"
            className="max-[760px]:hidden"
          >
            <ArrowLeftIcon aria-hidden="true" />
          </IconButton>
        }
      >
        {deviceId && (
          <>
            <Link to="/tasks" search={search}>
              {c("tasks")}
            </Link>
            <Link to="/memory" search={search}>
              {t("projectReferences")}
            </Link>
            <Link to="/automations" search={search}>
              {t("projectAutomations")}
            </Link>
          </>
        )}
      </ShellProjectToolbar>
      {!deviceId && (
        <p role="alert" className="mb-4 max-w-[65ch] text-sm text-destructive-text">
          {t("projectUnavailableHint")}
        </p>
      )}
    </>
  );
}
