import type { RootGrant } from "@raypx/contracts/local";
import { ArrowUpIcon } from "@raypx/icons/arrow-up";
import { FolderIcon } from "@raypx/icons/folder";
import { PlusIcon } from "@raypx/icons/plus";
import { RefreshIcon } from "@raypx/icons/refresh";
import { ChevronRightIcon } from "@raypx/icons/chevron-right";
import { Button } from "@raypx/ui/components/ui/button";
import { SelectField } from "@raypx/ui/select-field";
import { IconButton } from "@raypx/ui/icon-button";
import { useTranslations } from "@raypx/i18n/browser";
import { useFilesStore } from "../store.tsx";

export function FilesToolbar({
  roots,
  rootId,
  path,
  onDirectory,
  onRefresh,
}: {
  roots: RootGrant[];
  rootId: string;
  path: string;
  onDirectory: (rootId: string, path: string) => unknown;
  onRefresh: () => unknown;
}) {
  const t = useTranslations("files");
  const c = useTranslations("common");
  const busy = useFilesStore((s) => s.busy);
  const setOperation = useFilesStore((s) => s.setOperation);
  const segments = path.split("/").filter(Boolean);
  const rootName = roots.find((root) => root.id === rootId)?.name ?? t("roots");
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
      <SelectField
        aria-label={t("roots")}
        className="w-52 max-w-full"
        value={roots.some((root) => root.id === rootId) ? rootId : null}
        placeholder={t("roots")}
        disabled={busy || roots.length === 0}
        onValueChange={(value) => void onDirectory(value, "")}
        options={roots.map((root) => ({ value: root.id, label: root.name }))}
      />
      <nav
        aria-label={t("breadcrumbs")}
        className="order-last min-w-0 basis-full overflow-x-auto rounded-lg bg-muted/40 px-2 py-1"
        title={path || "/"}
      >
        <ol className="flex w-max min-w-full items-center gap-1 text-sm">
          <li className="shrink-0">
            {path ? (
              <Button
                variant="ghost"
                className="max-w-52 truncate px-2"
                disabled={busy}
                onClick={() => void onDirectory(rootId, "")}
              >
                {rootName}
              </Button>
            ) : (
              <span aria-current="page" className="inline-block max-w-52 truncate px-2">
                {rootName}
              </span>
            )}
          </li>
          {segments.map((segment, index) => (
            <li key={index} className="flex shrink-0 items-center gap-1">
              <ChevronRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
              {index === segments.length - 1 ? (
                <span aria-current="page" className="max-w-52 truncate px-2 font-medium">
                  {segment}
                </span>
              ) : (
                <Button
                  variant="ghost"
                  className="max-w-52 truncate px-2"
                  disabled={busy}
                  onClick={() => void onDirectory(rootId, segments.slice(0, index + 1).join("/"))}
                >
                  {segment}
                </Button>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <div className="ml-auto flex max-w-full flex-wrap items-center gap-1">
        <IconButton
          label={t("up")}
          disabled={!path || busy}
          onClick={() => void onDirectory(rootId, path.split("/").slice(0, -1).join("/"))}
        >
          <ArrowUpIcon aria-hidden="true" />
        </IconButton>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setOperation({ type: "file" })}
        >
          <PlusIcon data-icon="inline-start" />
          {t("createFile")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setOperation({ type: "folder" })}
        >
          <FolderIcon data-icon="inline-start" />
          {t("createFolder")}
        </Button>
        <IconButton label={c("refresh")} disabled={busy} onClick={() => void onRefresh()}>
          <RefreshIcon aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}
