import { useLocale } from "@raypx/i18n/browser";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentId } from "@raypx/core/agents";
import type { PageId, PageVersion } from "@raypx/core/pages";
import type { SpaceEvent, SpaceId } from "@raypx/core/spaces";
import { ShellToolbar } from "@raypx/blocks/shell";
import { Button } from "@raypx/ui/components/ui/button";
import { EmptyState } from "@raypx/ui/empty-state";
import { FileTextIcon } from "@raypx/icons/file-text";
import { LoadingState } from "@raypx/ui/loading-state";
import { TooltipProvider } from "@raypx/ui/components/ui/tooltip";
import { useConfirmation } from "@raypx/ui/confirmation";
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
  const locale = useLocale();
  const [rows, setRows] = useState<PageVersion[]>([]);
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
      // The list contract omits authors. Current-version reads provide the bounded attribution.
      const versions = await Promise.all(pages.map((page) => port.get({ spaceId, id: page.id })));
      if (generation === listGeneration.current) {
        setRows(versions);
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
    setRows((current) => [page, ...current.filter((row) => row.id !== page.id)]);
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
        <ShellToolbar>
          <h1 className="truncate text-2xl font-medium">{t("title")}</h1>
        </ShellToolbar>
        <div className="flex justify-end">
          <Button
            ref={createButton}
            onClick={() => {
              creatingOpen.current = true;
              setCreating(true);
            }}
          >
            {t("newPage")}
          </Button>
        </div>
        {loading && <LoadingState label={t("loading")} />}
        {failed && (
          <div role="alert" className="flex flex-wrap items-center gap-2">
            <p>{t("error")}</p>
            <Button variant="outline" onClick={() => void refreshList()}>
              {t("retry")}
            </Button>
          </div>
        )}
        {!loading && !failed && rows.length === 0 && (
          <EmptyState title={t("empty")} icon={<FileTextIcon aria-hidden="true" />} />
        )}
        <ul className="flex min-w-0 flex-col divide-y">
          {rows.map((page) => {
            const maintainer =
              agents.find((agent) => agent.id === page.agentId)?.name ??
              (page.agentId ? t("unknownAgent") : t("noAgent"));
            const author = accountNames?.[page.author.accountId] ?? t("member");
            return (
              <li key={page.id}>
                <Button
                  variant="ghost"
                  className="h-auto w-full min-w-0 flex-col items-start gap-2 py-4 text-left"
                  onClick={() => void select(page.id)}
                >
                  <span className="w-full truncate font-medium" title={page.title}>
                    {page.title}
                  </span>
                  <span className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{page.kind === "document" ? t("document") : t("html")}</span>
                    <span className="max-w-full truncate">
                      {t("maintainer")}: {maintainer}
                    </span>
                    <span>
                      {t("updated")}:{" "}
                      <time
                        dateTime={page.updatedAt}
                        title={new Date(page.updatedAt).toLocaleString(locale)}
                      >
                        {new Date(page.updatedAt).toLocaleString(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </time>
                    </span>
                    <span className="max-w-full truncate">
                      {t("updatedBy")}:{" "}
                      {page.author.kind === "run" ? t("agentAuthor", { name: author }) : author}
                    </span>
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
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
      </div>
    </TooltipProvider>
  );
}
