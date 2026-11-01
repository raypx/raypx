import { Link } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";

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
  const search = { project: projectId, ...(deviceId ? { device: deviceId } : {}) };
  const style =
    "rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <>
      <nav
        aria-label={c("projectTools")}
        className="mb-5 flex flex-wrap gap-1 border-b border-border pb-3"
      >
        <Link to="/" className={style}>
          {t("allProjects")}
        </Link>
        {deviceId && (
          <>
            <Link to="/tasks" search={search} className={style}>
              {c("tasks")}
            </Link>
            <Link to="/memory" search={search} className={style}>
              {t("projectReferences")}
            </Link>
            <Link to="/automations" search={search} className={style}>
              {t("projectAutomations")}
            </Link>
          </>
        )}
      </nav>
      {!deviceId && (
        <p role="alert" className="max-w-[65ch] text-sm text-destructive-text">
          {t("projectUnavailableHint")}
        </p>
      )}
    </>
  );
}
