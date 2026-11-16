import { useLocale } from "@raypx/i18n/browser";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";
import type { AgentId } from "@raypx/core/agents";
import type { PageId, PageListItem, PageVersion } from "@raypx/core/pages";
import type { SpaceEvent, SpaceId } from "@raypx/core/spaces";
import { ShellActions, ShellToolbar } from "@raypx/blocks/shell";
import { Alert, AlertAction, AlertDescription } from "@raypx/ui/components/ui/alert";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Button } from "@raypx/ui/components/ui/button";
import { Skeleton } from "@raypx/ui/components/ui/skeleton";
import { EmptyState } from "@raypx/ui/empty-state";
import { ChevronRightIcon } from "@raypx/icons/chevron-right";
import { CodeFolderIcon } from "@raypx/icons/code-folder";
import { FileTextIcon } from "@raypx/icons/file-text";
import { PlusIcon } from "@raypx/icons/plus";
import { LoadingState } from "@raypx/ui/loading-state";
import { TooltipProvider } from "@raypx/ui/components/ui/tooltip";
import { useConfirmation } from "@raypx/ui/confirmation";
import { cn } from "@raypx/ui/lib/utils";
import { PageForm } from "./page-form.js";
import { PageDetail } from "./detail.js";
import { useTranslations } from "./i18n.js";
import {
  acceptPageVersion,
  beginPageEdit,
  pageHasDraft,
  pageFailure,
  type PageEditorState,
  type PagesClientPort,
} from "../model.js";

const noAgents: readonly { id: AgentId; name: string }[] = [];
export interface PagesWorkspaceProps {
  spaceId: SpaceId;
  port: PagesClientPort;
  apiOrigin: string;
  /** Whether this application can authenticate sandboxed document navigation. */
  canEmbedAuthenticatedDocuments: boolean;
  onOpenWebPreview?: () => void;
  agents?: readonly { id: AgentId; name: string }[];
  accountNames?: Readonly<Record<string, string>>;
  initialPageId?: PageId | null;
  onSelectPage?(this: void, id: PageId | null): void;
  onAskAgent?(this: void, agentId: AgentId, page: { id: PageId; title: string }): void;
  subscribe?(this: void, listener: (event: SpaceEvent) => void): () => void;
}

/** The surrounding shell supplies the Space picker and primary Agent action. */
export function PagesWorkspace(props: PagesWorkspaceProps) {
  return <PagesSession key={props.spaceId} {...props} />;
}

export function PagesWorkspaceLoading() {
  const t = useTranslations("pages");
  return (
    <PageDirectoryFrame>
      <PageListLoading label={t("loading")} />
    </PageDirectoryFrame>
  );
}

function PagesSession({
  spaceId,
  port,
  apiOrigin,
  canEmbedAuthenticatedDocuments,
  onOpenWebPreview,
  agents = noAgents,
  accountNames,
  initialPageId,
  onSelectPage,
  onAskAgent,
  subscribe,
}: PagesWorkspaceProps) {
  const t = useTranslations("pages");
  const [rows, setRows] = useState<PageListItem[]>([]);
  const [selected, setSelected] = useState<PageId | null>(initialPageId ?? null);
  const [editor, setEditor] = useState<PageEditorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [detailFailed, setDetailFailed] = useState(false);
  const [missing, setMissing] = useState(false);
  const [creating, setCreating] = useState(false);
  const createButton = useRef<HTMLButtonElement>(null);
  const creatingOpen = useRef(false);
  useEffect(
    () => () => {
      creatingOpen.current = false;
    },
    [],
  );
  const listGeneration = useRef(0);
  const detailGeneration = useRef(0);
  const selection = useRef(selected);
  useEffect(() => {
    selection.current = selected;
  }, [selected]);
  const { confirm, dialog } = useConfirmation();
  const refreshList = useCallback(async () => {
    const generation = ++listGeneration.current;
    try {
      const pages = await port.list({ spaceId });
      if (generation === listGeneration.current) {
        setRows(pages);
        setFailed(false);
      }
    } catch {
      if (generation === listGeneration.current) setFailed(true);
    } finally {
      if (generation === listGeneration.current) setLoading(false);
    }
  }, [port, spaceId]);
  useEffect(() => {
    void Promise.resolve().then(refreshList);
  }, [refreshList]);
  useEffect(() => {
    if (initialPageId === undefined) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (active) {
        setSelected(initialPageId);
        setDetailFailed(false);
        setMissing(false);
      }
    });
    return () => {
      active = false;
    };
  }, [initialPageId]);
  useEffect(() => {
    const generation = ++detailGeneration.current;
    let active = true;
    if (!selected) return;
    void port
      .get({ spaceId, id: selected })
      .then((page) => {
        if (active && generation === detailGeneration.current) {
          setEditor(beginPageEdit(page));
          setDetailFailed(false);
          setMissing(false);
        }
      })
      .catch((error: unknown) => {
        if (active && generation === detailGeneration.current) {
          setDetailFailed(true);
          setMissing(pageFailure(error) === "PAGE_NOT_FOUND");
        }
      });
    return () => {
      active = false;
    };
  }, [selected, spaceId, port]);
  const refreshOpenPage = useCallback(async () => {
    const id = selection.current;
    const generation = detailGeneration.current;
    if (!id) return;
    try {
      const page = await port.get({ spaceId, id });
      if (generation === detailGeneration.current) {
        setEditor((current) => (current ? acceptPageVersion(current, page) : beginPageEdit(page)));
        setDetailFailed(false);
        setMissing(false);
      }
    } catch (error) {
      if (generation === detailGeneration.current) {
        setDetailFailed(true);
        setMissing(pageFailure(error) === "PAGE_NOT_FOUND");
      }
    }
  }, [port, spaceId]);
  useEffect(() => {
    const refresh = () => {
      void refreshList();
      void refreshOpenPage();
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refreshList, refreshOpenPage]);
  useEffect(
    () =>
      subscribe?.((event) => {
        if (event.spaceId !== spaceId || !event.kind.startsWith("page.")) return;
        void refreshList();
        if (!("pageId" in event.payload) || event.payload.pageId !== selection.current) return;
        if (event.kind === "page.deleted") {
          setDetailFailed(true);
          setMissing(true);
          return;
        }
        const id = selection.current;
        const generation = detailGeneration.current;
        if (!id) return;
        void port
          .get({ spaceId, id })
          .then((page) => {
            if (generation !== detailGeneration.current) return;
            setEditor((current) =>
              current ? acceptPageVersion(current, page) : beginPageEdit(page),
            );
          })
          .catch((error: unknown) => {
            if (generation === detailGeneration.current) {
              setDetailFailed(true);
              setMissing(pageFailure(error) === "PAGE_NOT_FOUND");
            }
          });
      }),
    [subscribe, spaceId, port, refreshList],
  );
  async function select(id: PageId | null) {
    if (
      editor &&
      pageHasDraft(editor) &&
      !(await confirm({
        title: t("discardTitle"),
        description: t("discardDescription"),
        confirmLabel: t("discard"),
        cancelLabel: t("cancel"),
      }))
    )
      return;
    selection.current = id;
    setSelected(id);
    setDetailFailed(false);
    setMissing(false);
    onSelectPage?.(id);
  }
  function changed(page: PageVersion, preserveDraft = false) {
    setEditor((current) => {
      if (current?.current.id !== page.id) return current;
      if (preserveDraft) return { ...current, current: page };
      return beginPageEdit(page);
    });
    const { body: _body, reason: _reason, author, ...metadata } = page;
    const row = { ...metadata, author: { kind: author.kind, accountId: author.accountId } };
    setRows((current) => [row, ...current.filter((entry) => entry.id !== page.id)]);
  }
  const visibleEditor = !missing && editor?.current.id === selected ? editor : null;
  if (selected)
    return (
      <TooltipProvider escapeKeyBubbles>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
          <ShellToolbar>
            <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {visibleEditor?.current.title ?? t("title")}
            </h1>
          </ShellToolbar>
          <div>
            <Button variant="ghost" size="sm" onClick={() => void select(null)}>
              {t("back")}
            </Button>
          </div>
          {detailFailed && (
            <div role="alert" className="flex flex-wrap items-center gap-2">
              <p>{missing ? t("notFound") : t("error")}</p>
              {!missing && (
                <Button variant="outline" size="sm" onClick={() => void refreshOpenPage()}>
                  {t("retry")}
                </Button>
              )}
            </div>
          )}
          {!visibleEditor && !detailFailed && <LoadingState label={t("loading")} />}
          {visibleEditor && (
            <PageDetail
              key={visibleEditor.current.id}
              editor={visibleEditor}
              setEditor={setEditor}
              port={port}
              apiOrigin={apiOrigin}
              canEmbedAuthenticatedDocuments={canEmbedAuthenticatedDocuments}
              onOpenWebPreview={onOpenWebPreview}
              agents={agents}
              accountNames={accountNames}
              onChanged={changed}
              onDelete={() => {
                if (selection.current !== visibleEditor.current.id) {
                  void refreshList();
                  return;
                }
                setEditor(null);
                setSelected(null);
                onSelectPage?.(null);
                void refreshList();
              }}
              onAskAgent={onAskAgent}
            />
          )}
          {dialog}
        </div>
      </TooltipProvider>
    );
  return (
    <TooltipProvider escapeKeyBubbles>
      <PageDirectoryFrame
        createButton={createButton}
        onCreate={() => {
          creatingOpen.current = true;
          setCreating(true);
        }}
      >
        {loading && rows.length === 0 && <PageListLoading label={t("loading")} />}
        {failed && (
          <Alert variant="destructive">
            <AlertDescription>{t("error")}</AlertDescription>
            <AlertAction>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setFailed(false);
                  setLoading(true);
                  void refreshList();
                }}
              >
                {t("retry")}
              </Button>
            </AlertAction>
          </Alert>
        )}
        {!loading && !failed && rows.length === 0 && (
          <EmptyState title={t("empty")} icon={<FileTextIcon aria-hidden="true" />} />
        )}
        {rows.length > 0 && (
          <ul aria-label={t("title")} className={pageListSurface}>
            {rows.map((page) => (
              <PageListRow
                key={page.id}
                page={page}
                maintainer={agents.find((agent) => agent.id === page.agentId)?.name}
                author={accountNames?.[page.author.accountId]}
                onOpen={() => void select(page.id)}
              />
            ))}
          </ul>
        )}
      </PageDirectoryFrame>
      {creating && (
        <PageForm
          agents={agents}
          finalFocus={createButton}
          onClose={() => {
            creatingOpen.current = false;
            setCreating(false);
          }}
          onSave={async (page) => {
            const result = await port.create({ spaceId, page });
            if (!creatingOpen.current) {
              void refreshList();
              return;
            }
            creatingOpen.current = false;
            changed(result);
            setCreating(false);
            setSelected(result.id);
            onSelectPage?.(result.id);
          }}
        />
      )}
      {dialog}
    </TooltipProvider>
  );
}

function PageDirectoryFrame({
  createButton,
  onCreate,
  children,
}: {
  createButton?: Ref<HTMLButtonElement>;
  onCreate?: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("pages");
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ShellToolbar>
        <h1 className="min-w-0 truncate text-sm font-semibold text-foreground">{t("title")}</h1>
      </ShellToolbar>
      <ShellActions>
        <Button
          ref={createButton}
          size="sm"
          className="pointer-coarse:min-h-11"
          disabled={!onCreate}
          onClick={onCreate}
        >
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          {t("newPage")}
        </Button>
      </ShellActions>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-3 px-3 py-3 sm:px-5 sm:py-5">
          {children}
        </div>
      </div>
    </div>
  );
}

const pageListSurface =
  "@container/pages min-w-0 divide-y divide-border rounded-xl border border-border bg-surface-panel";
const pageRow = {
  item: "px-1 py-1 @lg/pages:px-2",
  grid: "grid h-auto w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center justify-start gap-x-3 gap-y-1 px-2 py-2.5 text-left @lg/pages:grid-cols-[auto_minmax(0,1fr)_auto_auto] @lg/pages:px-3",
  icon: "col-start-1 row-span-2 row-start-1 size-9 self-start rounded-lg @lg/pages:row-span-1 @lg/pages:self-center",
  identity: "col-start-2 row-start-1 flex min-w-0 flex-col gap-1.5",
  details:
    "flex min-w-0 flex-col items-start gap-1 @lg/pages:flex-row @lg/pages:items-center @lg/pages:gap-2.5",
  updated: "col-start-2 row-start-2 min-w-0 @lg/pages:col-start-3 @lg/pages:row-start-1",
  chevron: "col-start-3 row-span-2 row-start-1 @lg/pages:col-start-4 @lg/pages:row-span-1",
};

function PageListLoading({ label }: { label: string }) {
  return (
    <div role="status">
      <span className="sr-only">{label}</span>
      <ul
        aria-hidden="true"
        className={cn(pageListSurface, "motion-reduce:[&_[data-slot=skeleton]]:animate-none")}
      >
        {["w-36", "w-48", "w-28"].map((width) => (
          <li key={width} className={pageRow.item}>
            <div className={cn(pageRow.grid, "border border-transparent")}>
              <Skeleton className={pageRow.icon} />
              <div className={pageRow.identity}>
                <div className="flex h-5 items-center">
                  <Skeleton className={cn("h-3.5 max-w-full", width)} />
                </div>
                <div className={pageRow.details}>
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <div className="flex h-4 w-28 max-w-full items-center">
                    <Skeleton className="h-2.5 w-full" />
                  </div>
                </div>
              </div>
              <div className={cn(pageRow.updated, "flex h-4 items-center")}>
                <Skeleton className="h-2.5 w-28 max-w-full" />
              </div>
              <div className={cn(pageRow.chevron, "size-4")} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const pageKindIcon = { document: FileTextIcon, html: CodeFolderIcon };

function PageListRow({
  page,
  maintainer,
  author,
  onOpen,
}: {
  page: PageListItem;
  maintainer: string | undefined;
  author: string | undefined;
  onOpen: () => void;
}) {
  const t = useTranslations("pages");
  const locale = useLocale();
  const id = useId();
  const KindIcon = pageKindIcon[page.kind];
  const authorName = author ?? t("member");
  const attributedAuthor =
    page.author.kind === "run" ? t("agentAuthor", { name: authorName }) : authorName;
  const maintainerName = maintainer ?? t("unknownAgent");
  const updatedAt = new Date(page.updatedAt);
  return (
    <li className={pageRow.item}>
      <Button
        variant="ghost"
        className={pageRow.grid}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-details ${id}-updated`}
        onClick={onOpen}
      >
        <span
          className={cn(pageRow.icon, "grid place-items-center bg-muted text-muted-foreground")}
        >
          <KindIcon aria-hidden="true" />
        </span>
        <span className={pageRow.identity}>
          <span id={`${id}-title`} className="truncate" title={page.title}>
            {page.title}
          </span>
          <span
            id={`${id}-details`}
            className={cn(pageRow.details, "text-xs font-normal text-muted-foreground")}
          >
            <Badge variant="secondary">{t(page.kind)}</Badge>
            {page.agentId && (
              <span
                className="sr-only @lg/pages:not-sr-only @lg/pages:truncate"
                title={maintainerName}
              >
                {t("maintainer")}: {maintainerName}
              </span>
            )}
            <span className="max-w-full truncate" title={attributedAuthor}>
              {t("updatedBy")}: {attributedAuthor}
            </span>
          </span>
        </span>
        <span
          id={`${id}-updated`}
          className={cn(
            pageRow.updated,
            "truncate text-xs font-normal text-muted-foreground tabular-nums",
          )}
        >
          <span className="sr-only">{t("updated")}: </span>
          <time dateTime={page.updatedAt} title={updatedAt.toLocaleString(locale)}>
            {updatedAt.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
          </time>
        </span>
        <ChevronRightIcon
          aria-hidden="true"
          className={cn(pageRow.chevron, "text-muted-foreground")}
        />
      </Button>
    </li>
  );
}
