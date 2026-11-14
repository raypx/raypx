import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { IconButton } from "@raypx/ui/icon-button";
import { ChevronRightIcon } from "@raypx/icons/chevron-right";
import { ChevronDownIcon } from "@raypx/icons/chevron-down";
import { FileTextIcon } from "@raypx/icons/file-text";
import { RefreshIcon } from "@raypx/icons/refresh";
import { FolderIcon } from "@raypx/icons/folder";
import { EmptyState } from "@raypx/ui/empty-state";
import { Skeleton } from "@raypx/ui/components/ui/skeleton";
import {
  computerFileDestination,
  computerFileRows,
  computerPreviewText,
  type ComputerFilesController,
  type ComputerFileTreeRow,
  type DirectoryView,
  type FilePreviewView,
} from "../model/computer-files.js";
import type { ComputerView } from "../model/computer.js";
import { useTranslations } from "./i18n.js";

function FileState({ value }: { value: DirectoryView | FilePreviewView }) {
  const t = useTranslations("agents");
  if (value.status === "available") return null;
  if (value.status === "loading")
    return (
      <div role="status" aria-label={t("loading")} className="flex flex-col gap-2 py-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    );
  if (value.status === "waiting")
    return (
      <p role="status" className="text-xs text-muted-foreground">
        {t("files.deviceWaiting")}
      </p>
    );
  if (value.status === "unavailable" && value.code === "DEVICE_NOT_OWNED")
    return <p className="text-xs text-muted-foreground">{t("files.deviceNotOwned")}</p>;
  if (value.status === "unavailable" && value.code === "DEVICE_GRANT_UNAVAILABLE")
    return <p className="text-xs text-muted-foreground">{t("files.deviceUnavailable")}</p>;
  if (value.status === "not-running") {
    const states = {
      stopped: "computerStopped",
      destroyed: "computerStopped",
      starting: "computerStarting",
      running: "computerRunning",
      stopping: "computerStopping",
      failed: "computerFailed",
    } as const;
    return (
      <p className="text-xs text-muted-foreground wrap-anywhere">
        {t("files.notRunning", { state: t(states[value.state ?? "stopped"]) })}
      </p>
    );
  }
  if (value.status === "unavailable" && value.code === "COMPUTER_UNAVAILABLE") {
    return <p className="text-xs text-muted-foreground">{t("files.computerUnavailable")}</p>;
  }
  const keys = {
    loading: "loading",
    error: "files.loadError",
    "not-configured": "files.notConfigured",
    unavailable: "files.unavailable",
  } as const;
  if (value.status === "error")
    return (
      <Alert>
        <AlertDescription>{t(keys[value.status])}</AlertDescription>
      </Alert>
    );
  return <p className="text-xs text-muted-foreground wrap-anywhere">{t(keys[value.status])}</p>;
}

export function ComputerFiles({
  controller,
  status,
  refreshKey,
  device,
}: {
  controller: ComputerFilesController;
  status: ComputerView["status"];
  refreshKey: string;
  device?: import("@raypx/core/computers").DeviceComputerSelection | null | undefined;
}) {
  const t = useTranslations("agents");
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [focusPath, setFocusPath] = useState(".");
  const nodes = useRef(new Map<string, HTMLElement>());
  const focusWithin = useRef(false);
  useEffect(() => {
    controller.selectComputer(device ?? null);
    if (!device && status === "loading") return;
    if (device || status === "running") void controller.refresh();
    else if (status !== "loading") controller.setUnavailable(status);
  }, [controller, status, refreshKey, device]);
  useEffect(() => () => controller.clear(), [controller]);
  const root = view.directories["."];
  const rows = computerFileRows(view);
  const focusExists = rows.some((row) => row.path === focusPath);
  useLayoutEffect(() => {
    if (focusExists) return;
    if (focusWithin.current) nodes.current.get(".")?.focus();
  }, [focusExists]);
  function move(path: string) {
    setFocusPath(path);
    nodes.current.get(path)?.focus();
  }
  function activate(row: ComputerFileTreeRow) {
    if (row.kind === "file") {
      void controller.select(row.path);
      return;
    }
    if (row.kind !== "directory") return;
    if (view.expanded.includes(row.path)) controller.collapse(row.path);
    else void controller.expand(row.path);
  }
  function onKey(event: KeyboardEvent<HTMLButtonElement>, row: ComputerFileTreeRow) {
    const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    if (
      event.key === "ArrowRight" &&
      row.kind === "directory" &&
      !view.expanded.includes(row.path)
    ) {
      void controller.expand(row.path);
      return;
    }
    if (event.key === "ArrowLeft" && row.kind === "directory" && view.expanded.includes(row.path)) {
      controller.collapse(row.path);
      return;
    }
    move(computerFileDestination(view, row.path, event.key));
  }
  const preview = view.preview;
  function downloadPreview() {
    if (preview?.status !== "available" || preview.truncated || !view.selectedPath) return;
    const bytes = Uint8Array.from(atob(preview.bytes), (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = view.selectedPath.split("/").at(-1) ?? "file";
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  return (
    <section
      aria-label={t("files.title")}
      className="flex w-full min-w-0 max-w-full flex-col gap-3"
    >
      <div className="flex w-full min-w-0 max-w-full items-center justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
          {t("files.title")}
        </h3>
        <IconButton
          label={t("files.refresh")}
          size="icon-sm"
          disabled={(!device && status !== "running") || view.refreshing}
          onClick={() => void controller.refresh()}
        >
          <RefreshIcon aria-hidden="true" />
        </IconButton>
      </div>
      {root && root.status !== "available" && <FileState value={root} />}
      {root?.status === "available" && (
        <div
          role="tree"
          aria-label={t("files.workspace")}
          aria-busy={view.refreshing}
          className="w-full min-w-0 max-w-full"
          onFocusCapture={() => {
            focusWithin.current = true;
          }}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) focusWithin.current = false;
          }}
        >
          {rows.map((row) => {
            const directory = view.directories[row.path];
            const expanded = row.kind === "directory" && view.expanded.includes(row.path);
            const label =
              row.path === "." ? t("files.workspace") : (row.path.split("/").at(-1) ?? row.path);
            const size = view.sizes[row.path];
            return (
              <div key={row.path} className="w-full min-w-0 max-w-full">
                <Button
                  ref={(node) => {
                    if (node) nodes.current.set(row.path, node);
                    else nodes.current.delete(row.path);
                  }}
                  role="treeitem"
                  variant="ghost"
                  size="sm"
                  className="w-full min-w-0 max-w-full justify-start px-2 text-left aria-selected:bg-muted"
                  tabIndex={focusPath === row.path || (!focusExists && row.path === ".") ? 0 : -1}
                  aria-label={row.path === "." ? t("files.workspace") : row.path}
                  aria-level={row.depth}
                  aria-posinset={row.position}
                  aria-setsize={row.siblings}
                  aria-expanded={row.kind === "directory" ? expanded : undefined}
                  aria-selected={view.selectedPath === row.path}
                  aria-disabled={row.kind === "symlink" || undefined}
                  title={row.kind === "symlink" ? t("files.symlink") : row.path}
                  onFocus={() => setFocusPath(row.path)}
                  onKeyDown={(event) => onKey(event, row)}
                  onClick={() => activate(row)}
                >
                  {row.depth > 1 && (
                    <span aria-hidden="true" className="flex max-w-12 shrink-0 overflow-hidden">
                      {Array.from({ length: Math.min(row.depth - 1, 4) }, (_, index) => (
                        <span key={index} className="w-3 shrink-0" />
                      ))}
                    </span>
                  )}
                  {row.kind === "directory" && expanded && (
                    <ChevronDownIcon data-icon="inline-start" aria-hidden="true" />
                  )}
                  {row.kind === "directory" && !expanded && (
                    <ChevronRightIcon data-icon="inline-start" aria-hidden="true" />
                  )}
                  {row.kind === "directory" && (
                    <FolderIcon data-icon="inline-start" aria-hidden="true" />
                  )}
                  {row.kind !== "directory" && (
                    <FileTextIcon data-icon="inline-start" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1 truncate" title={row.path}>
                    {label}
                  </span>
                  {size !== undefined && (
                    <span
                      className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums"
                      title={t("files.size", { size })}
                    >
                      {t("files.size", { size })}
                    </span>
                  )}
                </Button>
                {expanded && directory?.status === "available" && directory.truncated && (
                  <p className="py-1 text-xs text-muted-foreground wrap-anywhere">
                    {t("files.directoryTruncated")}
                  </p>
                )}
                {expanded && directory && directory.status !== "available" && (
                  <FileState value={directory} />
                )}
              </div>
            );
          })}
          {root.entries.length === 0 && (
            <EmptyState
              title={t("files.empty")}
              icon={<FolderIcon aria-hidden="true" />}
              className="py-8"
            />
          )}
        </div>
      )}
      {view.selectedPath && preview && (
        <section
          aria-label={t("files.preview")}
          className="flex w-full min-w-0 max-w-full flex-col gap-2 border-t pt-3"
        >
          <nav aria-label={t("files.breadcrumbs")} className="min-w-0">
            <ol className="flex min-w-0 flex-wrap items-center gap-1 text-xs">
              <li>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    void controller.expand(".");
                    move(".");
                  }}
                >
                  {t("files.workspace")}
                </Button>
              </li>
              {view.selectedPath
                .split("/")
                .filter((part) => part && part !== ".")
                .map((part, index, parts) => {
                  const path = parts.slice(0, index + 1).join("/");
                  const last = index === parts.length - 1;
                  return (
                    <li key={path} className="flex min-w-0 items-center gap-1">
                      <ChevronRightIcon
                        aria-hidden="true"
                        className="size-3 shrink-0 text-muted-foreground"
                      />
                      {last ? (
                        <span aria-current="page" className="min-w-0 break-all font-medium">
                          {part}
                        </span>
                      ) : (
                        <Button
                          size="xs"
                          variant="ghost"
                          className="min-w-0 max-w-full"
                          title={path}
                          onClick={() => {
                            void controller.expand(path);
                            move(path);
                          }}
                        >
                          <span className="truncate">{part}</span>
                        </Button>
                      )}
                    </li>
                  );
                })}
            </ol>
          </nav>
          <FileState value={preview} />
          {preview.status === "available" && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground tabular-nums">
                  {t("files.size", { size: preview.size })}
                </p>
                <span title={preview.truncated ? t("files.downloadUnavailable") : undefined}>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={preview.truncated}
                    onClick={downloadPreview}
                  >
                    {t("files.download")}
                  </Button>
                </span>
              </div>
              {preview.contentType === "binary" && <p className="text-sm">{t("files.binary")}</p>}
              {preview.contentType === "text" && (
                <pre className="box-border max-h-80 w-full min-w-0 max-w-full overflow-x-auto overflow-y-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap wrap-normal">
                  {computerPreviewText(preview.bytes)}
                </pre>
              )}
              {preview.truncated && (
                <p className="text-xs text-muted-foreground">{t("files.previewTruncated")}</p>
              )}
            </>
          )}
        </section>
      )}
    </section>
  );
}
