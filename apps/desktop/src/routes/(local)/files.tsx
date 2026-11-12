import { useTranslations } from "../../i18n.js";
import { createFileRoute, getRouteApi, useBlocker, useRouter } from "@tanstack/react-router";
import { FolderOpenIcon } from "@raypx/icons/folder-open";
import { Alert, AlertAction, AlertDescription } from "@raypx/ui/components/ui/alert";
import { Button } from "@raypx/ui/components/ui/button";
import { useConfirmation } from "@raypx/ui/confirmation";

import { useEffect, useRef } from "react";
import { cn } from "@raypx/ui/lib/utils";

import { localRequest } from "../../lib/desktop.js";
import { filesSearch } from "../../features/files/search.js";
import {
  FilesProvider,
  fileErrors,
  isDirty,
  useFilesStore,
  useFilesStoreApi,
} from "../../features/files/store.js";
import { useFileActions } from "../../features/files/use-actions.js";
import { FilesToolbar } from "../../features/files/components/toolbar.js";
import { FileTable, type FileListingResult } from "../../features/files/components/table.js";
import { FileOperationForm } from "../../features/files/components/operation-form.js";
import { FileEditor } from "../../features/files/components/editor.js";
import { LocalWelcome } from "../../features/onboarding/welcome.js";
import { recentProjects, rememberProject } from "../../features/tasks/project-history.js";
import { ProjectTools } from "../../features/tasks/project-tools.js";

const localRoute = getRouteApi("/(local)");

export const Route = createFileRoute("/(local)/files")({
  staticData: { page: { title: "common.files", layout: "tool" } },
  preload: false,
  validateSearch: filesSearch,
  loaderDeps: ({ search }) => ({
    rootId: search.rootId ?? "",
    path: search.path ?? "",
    offset: search.offset ?? 0,
  }),
  loader: async ({ context, deps, parentMatchPromise }) => {
    const roots = (await parentMatchPromise).loaderData?.roots ?? null;
    const rootId =
      deps.rootId ||
      recentProjects().find((id) => roots?.some((root) => root.id === id)) ||
      roots?.[0]?.id ||
      "";
    const request: Promise<FileListingResult> =
      context.desktopAvailable && roots?.some((root) => root.id === rootId)
        ? localRequest("files.list", {
            rootId,
            path: deps.path,
            offset: deps.offset,
            limit: 100,
          }).then(
            (listing) => ({ status: "success" as const, listing }),
            () => ({ status: "error" as const }),
          )
        : Promise.resolve({
            status: "success",
            listing: { entries: [], total: 0, offset: deps.offset },
          });
    return { ...deps, rootId, request };
  },
  component: FilesRoute,
});

function FilesRoute() {
  return (
    <FilesProvider>
      <FilesPage />
    </FilesProvider>
  );
}

function FilesPage() {
  const { desktopAvailable } = Route.useRouteContext();
  const data = Route.useLoaderData();
  const { roots } = localRoute.useLoaderData();
  const router = useRouter();
  const t = useTranslations("files");
  const c = useTranslations("common");
  const tasks = useTranslations("tasks");
  const { confirm, dialog } = useConfirmation();
  const store = useFilesStoreApi();
  const dirty = useFilesStore(isDirty);
  const busy = useFilesStore((s) => s.busy);
  const error = useFilesStore((s) => s.error);
  const editorPath = useFilesStore((s) => s.editor?.path ?? null);
  const list = useRef<HTMLElement>(null);
  const previousEditor = useRef<{ path: string; directory: string; rootId: string } | null>(null);
  useEffect(() => {
    if (editorPath !== null) {
      previousEditor.current = { path: editorPath, directory: data.path, rootId: data.rootId };
      return;
    }
    const previous = previousEditor.current;
    previousEditor.current = null;
    if (previous?.directory !== data.path || previous.rootId !== data.rootId) return;
    const entry = Array.from(
      list.current?.querySelectorAll<HTMLButtonElement>("[data-file-path]") ?? [],
    ).find((button) => button.dataset.filePath === previous.path);
    entry?.focus();
  }, [data.path, data.rootId, editorPath]);
  useEffect(() => {
    if (roots?.some((root) => root.id === data.rootId)) rememberProject(data.rootId);
  }, [data.rootId, roots]);
  async function confirmDiscard() {
    return (
      !isDirty(store.getState()) ||
      confirm({
        title: t("unsaved"),
        description: store.getState().editor?.path ?? "",
        confirmLabel: c("discard"),
        cancelLabel: c("cancel"),
      })
    );
  }
  useBlocker({
    enableBeforeUnload: dirty,
    shouldBlockFn: async ({ next }) => {
      if (next.routeId === Route.id) {
        const search = filesSearch(next.search);
        const nextRoot =
          search.rootId ||
          recentProjects().find((id) => roots?.some((root) => root.id === id)) ||
          roots?.[0]?.id ||
          "";
        if (nextRoot === data.rootId && (search.path ?? "") === data.path) return false;
      }
      return !(await confirmDiscard());
    },
  });
  function refresh() {
    return router.invalidate({
      filter: (match) => match.routeId === Route.id || match.routeId === "/(local)",
    });
  }
  function navigateDirectory(rootId: string, path: string) {
    return router.navigate({ to: "/files", search: { rootId, path } });
  }
  const actions = useFileActions({
    rootId: data.rootId,
    path: data.path,
    refresh,
    confirmDiscard,
    confirmDelete: (entry) =>
      confirm({
        title: c("deleteNamed", { name: entry.name }),
        description: t("deleteConfirm"),
        confirmLabel: c("delete"),
        cancelLabel: c("cancel"),
      }),
  });
  function chooseFolder() {
    return actions.chooseFolder(async (rootId) => {
      await navigateDirectory(rootId, "");
      // The picker authorized the root even if the navigation was declined.
      if (router.state.matches.some((match) => match.routeId === Route.id)) await refresh();
    });
  }
  if (desktopAvailable && roots?.length === 0 && !data.rootId) return <LocalWelcome />;
  return (
    <section>
      {data.rootId && <ProjectTools projectId={data.rootId} />}
      {data.rootId && roots && !roots.some((root) => root.id === data.rootId) && (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{tasks("projectUnavailableHint")}</AlertDescription>
        </Alert>
      )}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1>{c("files")}</h1>
        <Button onClick={() => void chooseFolder()} disabled={busy || !desktopAvailable}>
          <FolderOpenIcon data-icon="inline-start" />
          {t("addRoot")}
        </Button>
      </header>
      {!desktopAvailable && (
        <Alert role="status" className="mb-5">
          <AlertDescription>{c("desktopOnly")}</AlertDescription>
        </Alert>
      )}
      {(error || (roots === null && !data.rootId)) && (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>
            {error && error !== fileErrors.error ? t(error) : c("error")}
          </AlertDescription>
          {roots === null && (
            <AlertAction>
              <Button variant="ghost" size="sm" onClick={() => void refresh()}>
                {c("refresh")}
              </Button>
            </AlertAction>
          )}
        </Alert>
      )}
      {!roots?.length && !data.rootId ? (
        <div className="flex flex-col items-center px-6 py-20 text-center">
          <FolderOpenIcon size={44} strokeWidth={1} className="mb-5 text-muted-foreground" />
          <h2 className="text-xl">{t("noRoots")}</h2>
          <p className="mt-2 max-w-[50ch] text-sm text-muted-foreground">{t("noRootsHint")}</p>
        </div>
      ) : (
        <>
          <FilesToolbar
            roots={roots ?? []}
            rootId={data.rootId}
            path={data.path}
            onDirectory={navigateDirectory}
            onRefresh={refresh}
          />
          <FileOperationForm onSubmit={actions.perform} />
          <div
            className={cn(
              "grid min-w-0 items-start gap-5",
              editorPath !== null &&
                "@3xl/main:h-[max(24rem,calc(100dvh-18rem))] @3xl/main:grid-cols-[minmax(16rem,0.85fr)_minmax(0,1.4fr)]",
            )}
          >
            <section
              ref={list}
              aria-label={t("browser")}
              className={cn(
                "min-w-0",
                editorPath !== null &&
                  "hidden @3xl/main:block @3xl/main:h-full @3xl/main:overflow-auto",
              )}
            >
              <FileTable
                request={data.request}
                offset={data.offset}
                onRetry={refresh}
                onOpen={(entry) =>
                  entry.kind === "directory"
                    ? navigateDirectory(data.rootId, entry.path)
                    : actions.open(entry)
                }
                onDelete={actions.remove}
                onPage={(offset) =>
                  router.navigate({
                    to: "/files",
                    search: { rootId: data.rootId, path: data.path, offset },
                    replace: true,
                  })
                }
              />
            </section>
            <FileEditor onSave={actions.save} onClose={actions.close} />
          </div>
        </>
      )}
      {dialog}
    </section>
  );
}
