import { useLocale } from "@raypx/i18n/browser";
import { useId, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AgentId } from "@raypx/core/agents";
import type { PageId, PageVersion } from "@raypx/core/pages";
import { ReplyMarkdown } from "@raypx/blocks/markdown";
import { IconButton } from "@raypx/ui/icon-button";
import { EditIcon } from "@raypx/icons/edit";
import { DeleteIcon } from "@raypx/icons/delete";
import { HistoryIcon } from "@raypx/icons/history";
import { ArrowUpRightIcon } from "@raypx/icons/arrow-up-right";
import { Button } from "@raypx/ui/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@raypx/ui/components/ui/dialog";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { useConfirmation } from "@raypx/ui/confirmation";
import {
  pageDocumentUrl,
  pageEditFailure,
  pageFailure,
  pageHasDraft,
  pageRestoreRequest,
  pageSaveRequest,
  type PageEditorState,
  type PagesClientPort,
  type PageVersionSummary,
} from "../model.js";
import { PageForm } from "./page-form.js";
import { PageSharing } from "./share.js";
import { useTranslations } from "./i18n.js";

export function PageDetail({
  editor,
  setEditor,
  port,
  apiOrigin,
  canEmbedAuthenticatedDocuments,
  onOpenWebPreview,
  agents,
  accountNames,
  onChanged,
  onDelete,
  onAskAgent,
}: {
  editor: PageEditorState;
  setEditor: Dispatch<SetStateAction<PageEditorState | null>>;
  port: PagesClientPort;
  apiOrigin: string;
  canEmbedAuthenticatedDocuments: boolean;
  onOpenWebPreview: (() => void) | undefined;
  agents: readonly { id: AgentId; name: string }[];
  accountNames: Readonly<Record<string, string>> | undefined;
  onChanged(this: void, page: PageVersion, preserveDraft?: boolean): void;
  onDelete(this: void): void;
  onAskAgent: ((agentId: AgentId, page: { id: PageId; title: string }) => void) | undefined;
}) {
  const t = useTranslations("pages");
  const locale = useLocale();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [overlay, setOverlay] = useState<"rename" | "history" | "share" | "fullscreen" | null>(
    null,
  );
  const [versions, setVersions] = useState<PageVersionSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPreview, setHistoryPreview] = useState<PageVersionSummary | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tooLarge, setTooLarge] = useState(false);
  const renameButton = useRef<HTMLButtonElement>(null);
  const shareButton = useRef<HTMLButtonElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const { confirm, dialog } = useConfirmation();
  const page = editor.current;
  const source = pageDocumentUrl(apiOrigin, page);
  async function save() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    setTooLarge(false);
    try {
      const current = await port.update(pageSaveRequest(editor));
      onChanged(current);
      setEditing(false);
    } catch (error) {
      setEditor((current) =>
        current?.current.id === page.id ? pageEditFailure(current, error) : current,
      );
      setTooLarge(pageFailure(error) === "PAGE_TOO_LARGE");
      setFailed(pageFailure(error) !== "PAGE_CONFLICT");
    } finally {
      setPending(false);
    }
  }
  async function latest() {
    setPending(true);
    setFailed(false);
    try {
      const current = await port.get({ spaceId: page.spaceId, id: page.id });
      setEditor((state) =>
        state?.current.id === page.id
          ? { ...state, current, conflict: false, newerVersion: null }
          : state,
      );
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }
  async function history() {
    setHistoryPreview(null);
    setOverlay("history");
    setHistoryLoading(true);
    setFailed(false);
    try {
      setVersions(await port.versions({ spaceId: page.spaceId, id: page.id }));
    } catch {
      setFailed(true);
    } finally {
      setHistoryLoading(false);
    }
  }
  async function restore(version: PageVersionSummary) {
    if (pending) return;
    if (
      !(await confirm({
        title: t("restoreTitle"),
        description: pageHasDraft(editor) ? t("discardDescription") : t("restoreDescription"),
        confirmLabel: t("restore"),
        cancelLabel: t("cancel"),
      }))
    )
      return;
    setPending(true);
    setFailed(false);
    try {
      const current = await port.restore(pageRestoreRequest(page, version));
      onChanged(current);
      setOverlay(null);
      setEditing(false);
    } catch (error) {
      setEditor((current) =>
        current?.current.id === page.id ? pageEditFailure(current, error) : current,
      );
      setFailed(true);
    } finally {
      setPending(false);
    }
  }
  async function remove() {
    if (
      pending ||
      !(await confirm({
        title: t("deleteTitle"),
        description: t("deleteDescription"),
        confirmLabel: t("delete"),
        cancelLabel: t("cancel"),
      }))
    )
      return;
    setPending(true);
    setFailed(false);
    try {
      await port.delete({ spaceId: page.spaceId, id: page.id, expectedVersion: page.version });
      onDelete();
    } catch (error) {
      setEditor((current) =>
        current?.current.id === page.id ? pageEditFailure(current, error) : current,
      );
      setFailed(true);
    } finally {
      setPending(false);
    }
  }
  async function stopEditing() {
    if (
      pageHasDraft(editor) &&
      !(await confirm({
        title: t("discardTitle"),
        description: t("discardDescription"),
        confirmLabel: t("discard"),
        cancelLabel: t("cancel"),
      }))
    )
      return;
    setEditor((current) =>
      current ? { ...current, draft: current.current.body, conflict: false } : null,
    );
    setEditing(false);
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {t("version", { version: page.version })}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setEditing(true)}>
          {t("edit")}
        </Button>
        <IconButton
          ref={renameButton}
          size="icon-sm"
          label={t("rename")}
          disabled={pending}
          onClick={() => setOverlay("rename")}
        >
          <EditIcon aria-hidden="true" />
        </IconButton>
        <IconButton
          ref={historyButton}
          size="icon-sm"
          label={t("history")}
          disabled={pending}
          onClick={() => void history()}
        >
          <HistoryIcon aria-hidden="true" />
        </IconButton>
        <Button ref={shareButton} size="sm" variant="outline" onClick={() => setOverlay("share")}>
          {t("share")}
        </Button>
        <IconButton
          ref={fullscreenButton}
          size="icon-sm"
          label={t("fullScreen")}
          onClick={() => setOverlay("fullscreen")}
        >
          <ArrowUpRightIcon aria-hidden="true" />
        </IconButton>
        {page.agentId && onAskAgent && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAskAgent(page.agentId!, { id: page.id, title: page.title })}
          >
            {t("askAgent")}
          </Button>
        )}
        <IconButton
          size="icon-sm"
          label={t("delete")}
          disabled={pending}
          onClick={() => void remove()}
        >
          <DeleteIcon aria-hidden="true" />
        </IconButton>
      </div>
      {(editor.conflict || editor.newerVersion !== null) && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
          <p>{editor.conflict ? t("conflict") : t("newer")}</p>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => void latest()}>
            {t("loadLatest")}
          </Button>
        </div>
      )}
      {failed && <p role="alert">{tooLarge ? t("tooLarge") : t("error")}</p>}
      {editing ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={
                pending || !pageHasDraft(editor) || editor.conflict || editor.newerVersion !== null
              }
              onClick={() => void save()}
            >
              {t("save")}
            </Button>
            <Button variant="outline" onClick={() => void stopEditing()}>
              {t("cancel")}
            </Button>
            {page.kind === "document" && (
              <Button
                variant="outline"
                aria-pressed={preview}
                onClick={() => setPreview((value) => !value)}
              >
                {t("preview")}
              </Button>
            )}
            {pageHasDraft(editor) && (
              <span role="status" className="text-xs text-muted-foreground">
                {t("unsaved")}
              </span>
            )}
          </div>
          <Field className="min-h-0 flex-1">
            <FieldLabel htmlFor={`${id}-source`}>{t("source")}</FieldLabel>
            <Textarea
              id={`${id}-source`}
              value={editor.draft}
              disabled={pending}
              maxLength={262144}
              className="min-h-64 flex-1 font-mono"
              onChange={(event) => {
                const draft = event.target.value;
                setEditor((current) => (current ? { ...current, draft } : null));
              }}
            />
          </Field>
          {preview && page.kind === "document" && (
            <section aria-label={t("preview")} className="min-w-0 rounded-lg border p-4">
              <ReplyMarkdown
                copyLabel={t("copy")}
                copiedLabel={t("copied")}
                copyErrorLabel={t("copyError")}
              >
                {editor.draft}
              </ReplyMarkdown>
            </section>
          )}
        </div>
      ) : (
        <PageDocumentPreview
          key={source}
          title={page.title}
          src={source}
          available={canEmbedAuthenticatedDocuments}
          onOpenWebPreview={onOpenWebPreview}
          className="min-h-64 w-full flex-1 rounded-lg border bg-background"
        />
      )}
      {overlay === "rename" && (
        <PageForm
          initial={page}
          agents={agents}
          finalFocus={renameButton}
          onClose={() => setOverlay(null)}
          onSave={async (input) => {
            const current = await port.rename({
              spaceId: page.spaceId,
              id: page.id,
              expectedVersion: page.version,
              title: input.title,
            });
            onChanged(current, true);
            setOverlay(null);
          }}
        />
      )}
      {overlay === "share" && (
        <PageSharing
          page={page}
          port={port}
          apiOrigin={apiOrigin}
          finalFocus={shareButton}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === "fullscreen" && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setOverlay(null);
          }}
        >
          <DialogContent
            closeLabel={t("close")}
            finalFocus={fullscreenButton}
            className="h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-[calc(100%-2rem)]"
          >
            <DialogHeader>
              <DialogTitle>{page.title}</DialogTitle>
            </DialogHeader>
            <PageDocumentPreview
              title={page.title}
              src={source}
              available={canEmbedAuthenticatedDocuments}
              onOpenWebPreview={onOpenWebPreview}
              className="h-full min-h-0 w-full rounded-lg border bg-background"
            />
          </DialogContent>
        </Dialog>
      )}
      {overlay === "history" && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setOverlay(null);
          }}
        >
          <DialogContent
            closeLabel={t("close")}
            finalFocus={historyButton}
            className="sm:max-w-3xl"
          >
            <DialogHeader>
              <DialogTitle>{t("history")}</DialogTitle>
            </DialogHeader>
            {historyLoading && <p role="status">{t("loading")}</p>}
            {failed && <p role="alert">{t("error")}</p>}
            {historyPreview && (
              <PageDocumentPreview
                title={`${historyPreview.title} · ${t("version", { version: historyPreview.version })}`}
                src={pageDocumentUrl(apiOrigin, historyPreview)}
                available={canEmbedAuthenticatedDocuments}
                onOpenWebPreview={onOpenWebPreview}
                className="h-64 max-h-[40dvh] w-full rounded-lg border bg-background"
              />
            )}
            <ul className="flex min-w-0 flex-col divide-y">
              {versions.map((version) => (
                <li
                  key={version.version}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div className="min-w-0">
                    <p>
                      {t("version", { version: version.version })} · {t(`reason.${version.reason}`)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {accountNames?.[version.author.accountId] ?? t("member")} ·{" "}
                      <time dateTime={version.updatedAt}>
                        {new Date(version.updatedAt).toLocaleString(locale)}
                      </time>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`${t("preview")} · ${t("version", { version: version.version })}`}
                      aria-pressed={historyPreview?.version === version.version}
                      onClick={() => setHistoryPreview(version)}
                    >
                      {t("preview")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending || version.version === page.version}
                      onClick={() => void restore(version)}
                    >
                      {t("restore")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </DialogContent>
        </Dialog>
      )}
      {dialog}
    </div>
  );
}

/** The mount capability gates every saved-document frame, including history and fullscreen. */
function PageDocumentPreview({
  available,
  onOpenWebPreview,
  title,
  src,
  className,
}: {
  available: boolean;
  onOpenWebPreview: (() => void) | undefined;
  title: string;
  src: string;
  className: string;
}) {
  const t = useTranslations("pages");
  if (!available)
    return (
      <div
        role="status"
        className="flex min-h-0 flex-1 flex-col items-start justify-center gap-3 rounded-lg border p-4"
      >
        <p>{t("webPreviewRequired")}</p>
        {onOpenWebPreview && (
          <Button variant="outline" onClick={onOpenWebPreview}>
            {t("openInWeb")}
          </Button>
        )}
      </div>
    );
  return (
    <iframe
      title={title}
      src={src}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className={className}
    />
  );
}
