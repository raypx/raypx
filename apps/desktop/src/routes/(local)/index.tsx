import { createFileRoute, getRouteApi, useBlocker, useRouter } from "@tanstack/react-router";
import { FolderOpen } from "lucide-react";
import { Button } from "@raypx/ui/components/ui/button";
import { useConfirmation } from "@raypx/ui/confirmation";
import { useTranslations } from "@raypx/i18n/browser";
import type { FileListing } from "@raypx/contracts/local";
import { localRequest } from "../../lib/desktop";
import { filesSearch } from "../../features/files/search";
import {
  FilesProvider,
  fileErrors,
  isDirty,
  useFilesStore,
  useFilesStoreApi,
} from "../../features/files/store";
import { useFileActions } from "../../features/files/use-actions";
import { FilesToolbar } from "../../features/files/components/toolbar";
import { FileTable, type FileListingResult } from "../../features/files/components/table";
import { FileOperationForm } from "../../features/files/components/operation-form";
import { FileEditor } from "../../features/files/components/editor";
import { LocalWelcome } from "../../features/onboarding/welcome";

const localRoute = getRouteApi("/(local)");

export const Route = createFileRoute("/(local)/")({
  preload: false,
  validateSearch: filesSearch,
  loaderDeps: ({ search }) => ({
    rootId: search.rootId ?? "",
    path: search.path ?? "",
    offset: search.offset ?? 0,
  }),
  loader: async ({ context, deps, parentMatchPromise }) => {
    const roots = (await parentMatchPromise).loaderData?.roots ?? null;
    const rootId = deps.rootId || roots?.[0]?.id || "";
    const request: Promise<FileListingResult> =
      context.desktopAvailable && rootId
        ? localRequest<FileListing>("files.list", {
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
  const { confirm, dialog } = useConfirmation();
  const store = useFilesStoreApi();
  const dirty = useFilesStore(isDirty);
  const busy = useFilesStore((s) => s.busy);
  const error = useFilesStore((s) => s.error);
  const notice = useFilesStore((s) => s.notice);
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
        const nextRoot = search.rootId || roots?.[0]?.id || "";
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
    return router.navigate({ to: "/", search: { rootId, path } });
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
    <section className="mx-auto max-w-[1320px] px-14 pt-13 pb-20 max-[1100px]:px-8 max-[1100px]:pt-9 max-[1100px]:pb-14">
      <header className="mb-10 flex items-start justify-between gap-6 max-[1100px]:flex-col max-[1100px]:gap-5">
        <div>
          <h1>{t("title")}</h1>
          <p className="mt-[9px] max-w-[64ch] text-muted-foreground">{t("intro")}</p>
        </div>
        <Button onClick={() => void chooseFolder()} disabled={busy || !desktopAvailable}>
          <FolderOpen size={16} />
          {t("addRoot")}
        </Button>
      </header>
      {!desktopAvailable && (
        <p className="mb-5 flex items-center gap-2 rounded-lg bg-muted px-3.5 py-3 text-[13px] [overflow-wrap:anywhere]">
          {c("desktopOnly")}
        </p>
      )}
      {(error || (roots === null && !data.rootId)) && (
        <p
          role="alert"
          className="mb-5 flex items-center gap-2 rounded-lg bg-[color-mix(in_oklch,var(--destructive)_8%,var(--background))] px-3.5 py-3 text-[13px] text-destructive [overflow-wrap:anywhere]"
        >
          {error && error !== fileErrors.error ? t(error) : c("error")}
          {roots === null && (
            <Button variant="ghost" onClick={() => void refresh()}>
              {c("refresh")}
            </Button>
          )}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mb-5 flex items-center gap-2 rounded-lg bg-muted px-3.5 py-3 text-[13px] [overflow-wrap:anywhere]"
        >
          {t(notice)}
        </p>
      )}
      {!roots?.length && !data.rootId ? (
        <div className="flex flex-col items-center px-6 py-20 text-center">
          <FolderOpen size={44} strokeWidth={1} className="mb-5 text-muted-foreground" />
          <h2 className="text-xl">{t("noRoots")}</h2>
          <p className="mt-[9px] max-w-[50ch] text-muted-foreground">{t("noRootsHint")}</p>
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
                to: "/",
                search: { rootId: data.rootId, path: data.path, offset },
                replace: true,
              })
            }
          />
        </>
      )}
      <FileEditor onSave={actions.save} onClose={actions.close} />
      {dialog}
    </section>
  );
}
