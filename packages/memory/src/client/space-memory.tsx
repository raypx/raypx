import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { AgentId } from "@raypx/core/agents";
import type { SpaceId } from "@raypx/core/spaces";
import {
  spaceMemoryInputSchema,
  type SpaceMemoryDocument,
  type SpaceMemoryRevision,
} from "@raypx/core/space-memory";
import { ReplyMarkdown } from "@raypx/blocks/markdown";
import { Button } from "@raypx/ui/components/ui/button";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Input } from "@raypx/ui/components/ui/input";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@raypx/ui/components/ui/dialog";
import { Field, FieldLabel, FieldGroup } from "@raypx/ui/components/ui/field";
import { SelectField } from "@raypx/ui/select-field";
import { IconButton } from "@raypx/ui/icon-button";
import { useConfirmation } from "@raypx/ui/confirmation";
import { PlusIcon } from "@raypx/icons/plus";
import { EditIcon } from "@raypx/icons/edit";
import { DeleteIcon } from "@raypx/icons/delete";
import { HistoryIcon } from "@raypx/icons/history";
import { ArchiveRestoreIcon } from "@raypx/icons/archive-restore";
import { RefreshIcon } from "@raypx/icons/refresh";
import {
  beginMemoryEdit,
  groupSpaceMemory,
  memoryEditorFailure,
  memoryRestoreRequest,
  reloadMemoryEditor,
  spaceMemoryFailure,
  type MemoryEditorState,
  type SpaceMemoryClientPort,
} from "../model/space-memory.js";
import { useTranslations } from "./i18n.js";
import { memoryClientKey } from "./request.js";

interface Props {
  showTitle?: boolean;
  spaceId: SpaceId;
  agentId: AgentId;
  client: SpaceMemoryClientPort;
}
export function SpaceMemoryPanel(props: Props) {
  return (
    <MemoryPanel
      key={`${props.spaceId}:${props.agentId}:${memoryClientKey(props.client)}`}
      {...props}
    />
  );
}
function MemoryPanel({ spaceId, agentId, client, showTitle = true }: Props) {
  const t = useTranslations("memory.space"),
    c = useTranslations("common");
  const [documents, setDocuments] = useState<SpaceMemoryDocument[]>([]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof spaceMemoryFailure>>();
  const [status, setStatus] = useState("");
  const [includeRemoved, setIncludeRemoved] = useState(false);
  const [editor, setEditor] = useState<MemoryEditorState | null>(null);
  const [history, setHistory] = useState<{
    current: SpaceMemoryDocument;
    revisions: SpaceMemoryRevision[];
    selected: number;
  } | null>(null);
  const active = useRef(true),
    locked = useRef(false),
    generation = useRef(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const { confirm, dialog } = useConfirmation();
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      const [own, shared] = await Promise.all([
        client.list({ spaceId, agentId, scope: "agent", includeRemoved, limit: 100 }),
        client.list({ spaceId, scope: "space", includeRemoved, limit: 100 }),
      ]);
      if (!active.current || generation.current !== request) return;
      setDocuments([...own, ...shared]);
      setError(undefined);
    } catch (failure) {
      if (active.current && generation.current === request) setError(spaceMemoryFailure(failure));
    } finally {
      if (active.current && generation.current === request) setLoading(false);
    }
  }, [client, spaceId, agentId, includeRemoved]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function act(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    setStatus("");
    try {
      await work();
    } catch (failure) {
      if (!active.current) return;
      setError(spaceMemoryFailure(failure));
      setEditor((state) => state && memoryEditorFailure(state, failure));
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  }
  function rememberFocus() {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  function startEditor(document: SpaceMemoryDocument | null) {
    rememberFocus();
    setError(undefined);
    setStatus("");
    setEditor(beginMemoryEdit(agentId, document));
  }
  async function save() {
    if (!editor || editor.conflict) return;
    const parsed = spaceMemoryInputSchema.safeParse(editor.draft);
    if (!parsed.success) {
      setStatus(t("invalid"));
      return;
    }
    await act(async () => {
      if (editor.current)
        await client.update({
          spaceId,
          id: editor.current.id,
          expectedRevision: editor.current.revision,
          document: parsed.data,
        });
      else await client.create({ spaceId, document: parsed.data });
      if (!active.current) return;
      setEditor(null);
      await load();
      if (active.current) setStatus(t("saved"));
    });
  }
  async function reloadEditor() {
    if (!editor?.current) return;
    const state = editor;
    await act(async () => {
      const current = await client.get({ spaceId, id: state.current!.id });
      if (active.current) {
        setEditor(reloadMemoryEditor(state, current));
        setStatus(t("reloaded"));
      }
    });
  }
  async function remove(document: SpaceMemoryDocument) {
    if (
      !(await confirm({
        title: t("removeTitle", { title: document.title }),
        description: t("removeHint"),
        confirmLabel: t("remove"),
        cancelLabel: c("cancel"),
      })) ||
      !active.current
    )
      return;
    await act(async () => {
      await client.remove({ spaceId, id: document.id, expectedRevision: document.revision });
      if (!active.current) return;
      await load();
      if (active.current) setStatus(t("deleted"));
    });
  }
  async function openHistory(document: SpaceMemoryDocument) {
    rememberFocus();
    await act(async () => {
      const [current, revisions] = await Promise.all([
        client.get({ spaceId, id: document.id }),
        client.history({ spaceId, id: document.id, limit: 100 }),
      ]);
      if (active.current)
        setHistory({ current, revisions, selected: revisions[0]?.revision ?? current.revision });
    });
  }
  async function restore() {
    if (!history) return;
    const revision = history.revisions.find((item) => item.revision === history.selected);
    if (!revision) return;
    if (
      !(await confirm({
        title: t("restoreTitle", { revision: revision.revision }),
        description: t("restoreHint"),
        confirmLabel: t("restoreConfirm"),
        cancelLabel: c("cancel"),
      })) ||
      !active.current
    )
      return;
    await act(async () => {
      const current = await client.restore(
        memoryRestoreRequest(spaceId, history.current, revision),
      );
      const revisions = await client.history({ spaceId, id: current.id, limit: 100 });
      if (!active.current) return;
      setHistory({ current, revisions, selected: current.revision });
      await load();
      if (active.current) setStatus(t("restored"));
    });
  }
  const groups = groupSpaceMemory(documents, agentId);
  const selected = history?.revisions.find((item) => item.revision === history.selected);
  const feedback = (
    <div aria-live="polite" aria-atomic="true" className="text-sm">
      <p>{status}</p>
      {error && <p className="text-destructive">{t(error)}</p>}
    </div>
  );
  return (
    <section aria-label={t("title")} className="flex min-h-0 min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {showTitle && <h2 className="text-lg font-medium">{t("title")}</h2>}
        <div className="flex gap-2">
          <IconButton label={c("refresh")} disabled={busy} onClick={() => void load()}>
            <RefreshIcon />
          </IconButton>
          <Button disabled={busy} onClick={() => startEditor(null)}>
            <PlusIcon aria-hidden="true" />
            {t("create")}
          </Button>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={includeRemoved} disabled={busy} onCheckedChange={setIncludeRemoved} />
        {t("includeRemoved")}
      </label>
      {!editor && !history && feedback}
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("loading")}
        </p>
      )}
      {(["agent", "space"] as const).map((scope) => (
        <section key={scope} className="min-w-0">
          <h3 className="mb-2 text-sm font-medium">{t(scope)}</h3>
          {groups[scope].length === 0 && !loading && (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          )}
          <ul className="divide-y rounded-lg border">
            {groups[scope].map((document) => (
              <li key={document.id} className="min-w-0 space-y-2 p-3">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="wrap-anywhere font-medium">{document.title}</p>
                    <div className="flex flex-wrap gap-1">
                      {document.pinned && <Badge variant="secondary">{t("pinned")}</Badge>}
                      {document.removed && <Badge variant="outline">{t("removed")}</Badge>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {!document.removed && (
                      <>
                        <IconButton
                          size="icon-sm"
                          label={t("editNamed", { title: document.title })}
                          disabled={busy}
                          onClick={() => startEditor(document)}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="icon-sm"
                          label={t("removeNamed", { title: document.title })}
                          disabled={busy}
                          onClick={() => void remove(document)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </>
                    )}
                    <IconButton
                      size="icon-sm"
                      label={t("historyNamed", { title: document.title })}
                      disabled={busy}
                      onClick={() => void openHistory(document)}
                    >
                      <HistoryIcon />
                    </IconButton>
                  </div>
                </div>
                <Provenance document={document} />
                {document.text && (
                  <div className="max-h-48 overflow-y-auto text-sm">
                    <MemoryMarkdown text={document.text} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setEditor(null);
            setError(undefined);
          }
        }}
      >
        <DialogContent
          closeLabel={c("close")}
          className="sm:max-w-3xl"
          finalFocus={() => (returnFocus.current?.isConnected ? returnFocus.current : false)}
        >
          {editor && (
            <>
              <DialogHeader>
                <DialogTitle>{t(editor.current ? "edit" : "create")}</DialogTitle>
              </DialogHeader>
              {feedback}
              <MemoryEditor
                state={editor}
                agentId={agentId}
                busy={busy}
                onChange={setEditor}
                onSave={() => void save()}
                onCancel={() => {
                  setEditor(null);
                  setError(undefined);
                }}
                onReload={() => void reloadEditor()}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!history}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setHistory(null);
            setError(undefined);
          }
        }}
      >
        <DialogContent
          closeLabel={c("close")}
          className="sm:max-w-4xl"
          finalFocus={() => (returnFocus.current?.isConnected ? returnFocus.current : false)}
        >
          {history && (
            <>
              <DialogHeader>
                <DialogTitle>{t("history")}</DialogTitle>
              </DialogHeader>
              {feedback}
              <Field>
                <FieldLabel htmlFor="memory-revision">{t("chooseRevision")}</FieldLabel>
                <SelectField
                  id="memory-revision"
                  value={String(history.selected)}
                  disabled={busy}
                  options={history.revisions.map((revision) => ({
                    value: String(revision.revision),
                    label: t("revision", { revision: revision.revision }),
                  }))}
                  onValueChange={(value) => setHistory({ ...history, selected: Number(value) })}
                />
              </Field>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <Revision document={selected} title={t("thisRevision")} />
                <Revision document={history.current} title={t("current")} />
              </div>
              {selected && (
                <Button
                  disabled={
                    busy || selected.revision === history.current.revision || selected.removed
                  }
                  onClick={() => void restore()}
                >
                  <ArchiveRestoreIcon aria-hidden="true" />
                  {t("restore", { revision: selected.revision })}
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      {dialog}
    </section>
  );
}
function MemoryMarkdown({ text }: { text: string }) {
  const t = useTranslations("memory.space");
  return (
    <ReplyMarkdown copyLabel={t("copy")} copiedLabel={t("copied")} copyErrorLabel={t("copyFailed")}>
      {text}
    </ReplyMarkdown>
  );
}
function Provenance({ document }: { document: SpaceMemoryDocument }) {
  const t = useTranslations("memory.space");
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>{t(document.provenance.kind === "member" ? "member" : "agentSaved")}</p>
      {document.provenance.untrustedInput && <p>{t("untrusted")}</p>}
      {document.provenance.accountId && (
        <p className="wrap-anywhere">{t("memberId", { id: document.provenance.accountId })}</p>
      )}
      {document.provenance.runId && (
        <p className="wrap-anywhere">{t("runId", { id: document.provenance.runId })}</p>
      )}
      {document.attribution.speaker && (
        <p className="wrap-anywhere">{t("speaker", { speaker: document.attribution.speaker })}</p>
      )}
      {document.attribution.source && (
        <p className="wrap-anywhere">
          {t("attributionSource", { source: document.attribution.source })}
        </p>
      )}
    </div>
  );
}
function Revision({
  document,
  title,
}: {
  document: SpaceMemoryDocument | undefined;
  title: string;
}) {
  const t = useTranslations("memory.space");
  return (
    <section aria-label={title} className="min-w-0 space-y-3 rounded-lg border p-3">
      <h3 className="font-medium">{title}</h3>
      {document ? (
        <>
          <p className="wrap-anywhere">{document.title}</p>
          <p className="text-xs text-muted-foreground">
            {t("revision", { revision: document.revision })}
          </p>
          <Provenance document={document} />
          {document.removed ? <p>{t("removed")}</p> : <MemoryMarkdown text={document.text ?? ""} />}
        </>
      ) : (
        <p>{t("noRevisions")}</p>
      )}
    </section>
  );
}
function MemoryEditor({
  state,
  agentId,
  busy,
  onChange,
  onSave,
  onCancel,
  onReload,
}: {
  state: MemoryEditorState;
  agentId: AgentId;
  busy: boolean;
  onChange: (state: MemoryEditorState) => void;
  onSave: () => void;
  onCancel: () => void;
  onReload: () => void;
}) {
  const t = useTranslations("memory.space"),
    c = useTranslations("common"),
    id = useId();
  const draft = state.draft;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && !state.conflict) onSave();
      }}
      className="min-w-0"
    >
      <FieldGroup className="gap-4">
        {state.conflict && (
          <div className="space-y-2 text-sm">
            <p>{t("draftKept")}</p>
            <Button type="button" variant="outline" disabled={busy} onClick={onReload}>
              {t("reload")}
            </Button>
          </div>
        )}
        <Field>
          <FieldLabel htmlFor={`${id}-scope`}>{t("scope")}</FieldLabel>
          <SelectField
            id={`${id}-scope`}
            value={draft.scope}
            disabled={busy}
            options={[
              { value: "agent", label: t("agent") },
              { value: "space", label: t("space") },
            ]}
            onValueChange={(scope) =>
              onChange({
                ...state,
                draft: { ...draft, scope, agentId: scope === "agent" ? agentId : null },
              })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-title`}>{t("documentTitle")}</FieldLabel>
          <Input
            id={`${id}-title`}
            maxLength={200}
            required
            value={draft.title}
            disabled={busy}
            onChange={(event) =>
              onChange({ ...state, draft: { ...draft, title: event.target.value } })
            }
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={draft.pinned}
            disabled={busy}
            onCheckedChange={(pinned) => onChange({ ...state, draft: { ...draft, pinned } })}
          />
          {t("pinned")}
        </label>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${id}-source`}>{t("source")}</FieldLabel>
            <Textarea
              id={`${id}-source`}
              value={draft.text}
              maxLength={16_000}
              disabled={busy}
              onChange={(event) =>
                onChange({ ...state, draft: { ...draft, text: event.target.value } })
              }
              className="min-h-56 font-mono"
              aria-describedby={`${id}-limit`}
            />
            <p id={`${id}-limit`} className="text-xs text-muted-foreground">
              {t("sourceLimit")}
            </p>
          </Field>
          <section className="min-w-0 space-y-2">
            <h3 className="text-sm font-medium">{t("preview")}</h3>
            <div className="max-h-72 overflow-y-auto rounded-lg border p-3 text-sm">
              <MemoryMarkdown text={draft.text} />
            </div>
          </section>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            {c("cancel")}
          </Button>
          <Button type="submit" disabled={busy || state.conflict}>
            {c(busy ? "working" : "save")}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
