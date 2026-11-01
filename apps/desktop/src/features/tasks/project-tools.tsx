import { Link } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";

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
  const style =
    "rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <nav
      aria-label={c("projectTools")}
      className="mb-5 flex flex-wrap gap-1 border-b border-border pb-3"
    >
      <Link
        className={style}
        to="/tasks"
        search={{
          scope: remote ? "remote" : "local",
          project: projectId,
          ...(deviceId ? { device: deviceId } : {}),
        }}
      >
        {c("tasks")}
      </Link>
      {!remote && (
        <Link className={style} to="/files" search={{ rootId: projectId }}>
          {c("files")}
        </Link>
      )}
      <Link
        className={style}
        to="/memory"
        search={{
          scope: remote ? "account" : "local",
          project: projectId,
          ...(deviceId ? { device: deviceId } : {}),
        }}
      >
        {t("projectReferences")}
      </Link>
      <Link
        className={style}
        to="/automations"
        search={{
          scope: remote ? "cloud" : "local",
          project: projectId,
          ...(deviceId ? { device: deviceId } : {}),
        }}
      >
        {t("projectAutomations")}
      </Link>
      {!remote && (
        <Link className={style} to="/terminal" search={{ project: projectId }}>
          {c("terminal")}
        </Link>
      )}
    </nav>
  );
}
