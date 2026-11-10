import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useFormatter, useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@raypx/ui/components/ui/input-group";
import { SearchIcon } from "@raypx/icons/search";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { SelectField } from "@raypx/ui/select-field";
import { useConfirmation } from "@raypx/ui/confirmation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@raypx/ui/components/ui/dialog";
import { LoadingState } from "@raypx/ui/loading-state";
import { EmptyState } from "@raypx/ui/empty-state";
import { HelpHint } from "@raypx/ui/help-hint";
import { IconButton } from "@raypx/ui/icon-button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { ArchiveIcon } from "@raypx/icons/archive";
import { ArchiveRestoreIcon } from "@raypx/icons/archive-restore";
import { BookOpenIcon } from "@raypx/icons/book-open";
import { ChevronRightIcon } from "@raypx/icons/chevron-right";
import { HistoryIcon } from "@raypx/icons/history";
import { EditIcon } from "@raypx/icons/edit";
import { PlusIcon } from "@raypx/icons/plus";
import { RefreshIcon } from "@raypx/icons/refresh";
import { DeleteIcon } from "@raypx/icons/delete";
import {
  contextDocumentInputSchema,
  type ContextDocument,
  type ContextDocumentSummary,
  type ContextVersion,
} from "../model.ts";
import type { MemoryClientPort, MemoryProjectsPort, MemoryUsagePort } from "./port.ts";
import { memoryClientKey, memoryFailure, useMemoryRequests } from "./request.ts";
import { DocumentForm, documentDraft } from "./form.tsx";
type EditorDestination = "new" | "close" | ContextDocumentSummary;
interface Props {
  client: MemoryClientPort;
  ownerKey: string;
  scope: "device" | "account";
  projects?: MemoryProjectsPort;
  usage?: MemoryUsagePort;
  target?: { deviceId: string; projectId: string } | undefined;
}
export function MemoryLibraryPage(props: Props) {
  return (
    <Library
      key={JSON.stringify([
        props.ownerKey,
        memoryClientKey(props.client),
        props.projects && memoryClientKey(props.projects),
        props.usage && memoryClientKey(props.usage),
        props.target?.deviceId,
        props.target?.projectId,
      ])}
      {...props}
    />
  );
}
function Library({ client, projects: projectPort, usage, scope, target }: Props) {
  const t = useTranslations("memory"),
    format = useFormatter(),
    c = useTranslations("common"),
    { confirm, dialog } = useConfirmation();
  const { isActive, request } = useMemoryRequests();
  const [documents, setDocuments] = useState<ContextDocumentSummary[]>();
  const [projects, setProjects] = useState<Awaited<ReturnType<MemoryProjectsPort["list"]>>>([]);
  const [error, setError] = useState<ReturnType<typeof memoryFailure>>();
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    locked = useRef(false);
  const generation = useRef(0),
    archiveGeneration = useRef(0),
    viewGeneration = useRef(0),
    creation = useRef<string | undefined>(undefined);
  const [editing, setEditing] = useState<ContextDocument | null | false>(false);
  const [draft, setDraft] = useState(() => documentDraft(null, target));
  const [invalid, setInvalid] = useState(false);
  const [destination, setDestination] = useState<EditorDestination>();
  const dirty =
    editing !== false && JSON.stringify(draft) !== JSON.stringify(documentDraft(editing, target));
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all"),
    [archived, setArchived] = useState(false);
  const [timeline, setTimeline] = useState<{
    document: ContextDocumentSummary;
    versions: ContextVersion[];
    more: boolean;
  }>();
  const load = useCallback(async () => {
    const current = ++generation.current;
    const [docs, targets] = await Promise.allSettled([
      request((options) => client.list({}, options)),
      projectPort ? request((options) => projectPort.list(options)) : Promise.resolve([]),
    ]);
    if (!isActive() || current !== generation.current) return;
    if (docs.status === "fulfilled") setDocuments(docs.value);
    if (targets.status === "fulfilled") setProjects(targets.value);
    const failed = [docs, targets].find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    setError(failed ? memoryFailure(failed.reason) : undefined);
    setLoading(false);
  }, [isActive, client, projectPort, request]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function mutate(run: () => Promise<void>) {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await run();
      return isActive();
    } catch (failure) {
      if (isActive()) setError(memoryFailure(failure));
      return false;
    } finally {
      locked.current = false;
      if (isActive()) setBusy(false);
    }
  }
  async function remove(document: ContextDocumentSummary) {
    await mutate(async () => {
      if (
        !(await confirm({
          requestKey: `memory-delete:${document.id}:${document.revision}`,
          title: t("deleteNamed", { name: document.name }),
          description: t("deleteHint"),
          confirmLabel: t("deletePermanently"),
          cancelLabel: c("cancel"),
        })) ||
        !isActive()
      )
        return;
      await request((options) =>
        client.delete({ id: document.id, revision: document.revision }, options),
      );
      if (!isActive()) return;
      viewGeneration.current++;
      if (editing && editing.id === document.id) setEditing(false);
      if (timeline?.document.id === document.id) setTimeline(undefined);
      await load();
    });
  }
  async function moveEditor(next: EditorDestination) {
    if (locked.current || !isActive()) return;
    if (typeof next === "string") {
      viewGeneration.current++;
      creation.current = undefined;
      setEditing(next === "new" ? null : false);
      setDraft(documentDraft(null, target));
      setInvalid(false);
      setError(undefined);
      return;
    }
    const current = ++viewGeneration.current;
    locked.current = true;
    setBusy(true);
    try {
      const value = await request((options) => client.get({ id: next.id }, options));
      if (isActive() && current === viewGeneration.current) {
        creation.current = undefined;
        setEditing(value);
        setDraft(documentDraft(value));
        setInvalid(false);
        setError(undefined);
      }
    } catch (failure) {
      if (isActive() && current === viewGeneration.current) setError(memoryFailure(failure));
    } finally {
      locked.current = false;
      if (isActive()) setBusy(false);
    }
  }
  function edit(next: EditorDestination) {
    if (locked.current || destination) return;
    if (next === "new" && editing === null) return;
    if (typeof next !== "string" && editing && editing.id === next.id) return;
    // Cancel stale reads before asking; a late response must not replace this draft.
    viewGeneration.current++;
    if (dirty) setDestination(next);
    else void moveEditor(next);
  }
  async function save() {
    const parsed = contextDocumentInputSchema.safeParse(draft);
    setInvalid(!parsed.success);
    if (!parsed.success) return false;
    const document = parsed.data;
    const saved = await mutate(async () => {
      if (editing)
        await request((options) =>
          client.update({ id: editing.id, revision: editing.revision, document }, options),
        );
      else {
        creation.current ??= crypto.randomUUID();
        const requestId = creation.current;
        await request((options) => client.create({ requestId, document }, options));
        creation.current = undefined;
      }
      if (!isActive()) return;
      setEditing(false);
      await load();
    });
    if (saved && destination) {
      setDestination(undefined);
      await moveEditor(destination);
    }
    return saved;
  }
  async function archive(document: ContextDocumentSummary) {
    if (locked.current || !isActive()) return;
    const current = ++archiveGeneration.current;
    await mutate(async () => {
      if (!document.archived) {
        let description = t(scope === "account" ? "archiveHint" : "localArchiveHint");
        if (scope === "account") {
          let plans: Awaited<ReturnType<MemoryUsagePort["scheduledPlans"]>> | undefined;
          try {
            if (usage)
              plans = await request((options) =>
                usage.scheduledPlans({ id: document.id }, options),
              );
          } catch {
            // Unknown is distinct from zero; the reversible action still requires confirmation.
          }
          if (!isActive() || current !== archiveGeneration.current) return;
          if (plans) {
            const preview = plans.slice(0, 3).map((plan) => {
              const characters = Array.from(plan.name.replace(/\s+/gu, " ").trim());
              const name =
                characters.length > 40
                  ? `${characters.slice(0, 39).join("")}…`
                  : characters.join("");
              return t("plans.preview", {
                name,
                status: t(plan.enabled ? "plans.enabled" : "plans.paused"),
              });
            });
            description += ` ${t("plans.count", { count: String(plans.length) })}`;
            if (preview.length) description += ` ${preview.join("; ")}.`;
            if (plans.length > 3)
              description += ` ${t("plans.more", { count: String(plans.length - 3) })}`;
          } else description += ` ${t("plans.unknown")}`;
        }
        if (
          !(await confirm({
            requestKey: `memory-archive:${document.id}`,
            title: t("archiveNamed", { name: document.name }),
            description,
            confirmLabel: t("archive"),
            cancelLabel: c("cancel"),
          }))
        )
          return;
      }
      if (!isActive() || current !== archiveGeneration.current) return;
      await request((options) =>
        client.archive(
          { id: document.id, revision: document.revision, archived: !document.archived },
          options,
        ),
      );
      await load();
    });
  }
  async function history(document: ContextDocumentSummary) {
    const current = ++viewGeneration.current;
    try {
      const versions = await request((options) =>
        client.history({ id: document.id, limit: 20 }, options),
      );
      if (isActive() && current === viewGeneration.current) {
        setTimeline({ document, versions, more: versions.length === 20 });
        setError(undefined);
      }
    } catch (failure) {
      if (isActive() && current === viewGeneration.current) setError(memoryFailure(failure));
    }
  }
  async function more() {
    if (!timeline) return;
    const previous = timeline;
    await mutate(async () => {
      const versions = await request((options) =>
        client.history(
          { id: previous.document.id, before: previous.versions.at(-1)?.revision, limit: 20 },
          options,
        ),
      );
      if (isActive())
        setTimeline((current) =>
          current?.document.id === previous.document.id
            ? {
                ...current,
                versions: [
                  ...new Map(
                    [...current.versions, ...versions].map((version) => [
                      version.revision,
                      version,
                    ]),
                  ).values(),
                ],
                more: versions.length === 20,
              }
            : current,
        );
    });
  }
  async function restore(version: ContextVersion) {
    if (!timeline) return;
    const current = timeline.document;
    if (
      !(await confirm({
        requestKey: `memory-restore:${version.id}:${version.revision}`,
        title: t("restoreRevision", { revision: String(version.revision) }),
        description: t("restoreHint"),
        confirmLabel: t("restore"),
        cancelLabel: c("cancel"),
      })) ||
      !isActive()
    )
      return;
    await mutate(async () => {
      const document = await request((options) =>
        client.restore(
          { id: current.id, revision: current.revision, version: version.revision },
          options,
        ),
      );
      await load();
      if (isActive()) await history(document);
    });
  }
  const eligible = documents?.filter(
    (document) =>
      !target ||
      !document.project ||
      (document.project.deviceId === target.deviceId &&
        document.project.projectId === target.projectId),
  );
  const search = query.trim().toLocaleLowerCase();
  const shown = eligible?.filter(
    (document) =>
      (archived || !document.archived) &&
      (kind === "all" || document.kind === kind) &&
      `${document.name} ${document.category}`.toLocaleLowerCase().includes(search),
  );
  function projectLabel(document: ContextDocumentSummary) {
    if (!document.project) return t("global");
    return (
      projects.find(
        (project) =>
          project.deviceId === document.project?.deviceId &&
          project.projectId === document.project?.projectId,
      )?.name ?? t("projectUnavailable")
    );
  }
  function emptyTitle() {
    if (eligible?.length) return t("noMatches");
    return t("empty");
  }
  return (
    <section>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <h1>{t("title")}</h1>
            <HelpHint label={t("help")} description={`${t("referenceHint")} ${t("quotaHint")}`} />
          </div>
          <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
            {t(scope === "device" ? "deviceHint" : "accountHint")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            label={c("refresh")}
            variant="outline"
            disabled={loading || busy}
            onClick={() => {
              setLoading(true);
              void load();
            }}
          >
            <RefreshIcon aria-hidden="true" />
          </IconButton>
          <Button disabled={busy} onClick={() => edit("new")}>
            <PlusIcon aria-hidden="true" />
            {t("create")}
          </Button>
        </div>
      </header>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{t(error)}</AlertDescription>
        </Alert>
      )}
      {editing !== false && (
        <DocumentForm
          key={editing ? `${editing.id}:${editing.revision}` : "new"}
          document={editing}
          draft={draft}
          onChange={setDraft}
          invalid={invalid}
          projects={projects}
          busy={busy}
          onSave={save}
          onCancel={() => edit("close")}
        />
      )}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <InputGroup className="min-w-48 flex-1">
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            id={searchId}
            type="search"
            aria-label={t("search")}
            placeholder={t("search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </InputGroup>
        <SelectField
          className="w-44 max-w-full"
          aria-label={t("kind")}
          value={kind}
          onValueChange={setKind}
          options={[
            { value: "all", label: t("all") },
            { value: "memory", label: t("memory") },
            { value: "template", label: t("template") },
          ]}
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={archived} onCheckedChange={setArchived} />
          {t("includeArchived")}
        </label>
      </div>
      {documents && (
        <p className="mb-3 text-xs text-muted-foreground tabular-nums">
          {t("matchingReferences", {
            shown: String(shown?.length ?? 0),
            total: String(eligible?.length ?? 0),
          })}
        </p>
      )}
      {!documents && loading && <LoadingState label={c("loading")} />}
      {shown?.length === 0 && (
        <EmptyState
          className="py-10"
          icon={<BookOpenIcon aria-hidden="true" />}
          title={emptyTitle()}
        />
      )}
      {shown?.map((document) => (
        <article
          key={document.id}
          className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border py-4"
        >
          <div className="min-w-0 basis-56 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-medium wrap-anywhere">{document.name}</h2>
              <Badge variant="secondary">{t(document.kind)}</Badge>
              {document.archived && <Badge variant="outline">{t("archived")}</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground *:not-first:before:mr-2 *:not-first:before:text-muted-foreground/50 *:not-first:before:content-['·']">
              <span>{document.category || t("uncategorized")}</span>
              <span className="tabular-nums">
                {t("revision", { revision: String(document.revision) })}
              </span>
              <span className="wrap-anywhere">{projectLabel(document)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <IconButton label={t("history")} disabled={busy} onClick={() => void history(document)}>
              <HistoryIcon aria-hidden="true" />
            </IconButton>
            <IconButton
              label={t("editNamed", { name: document.name })}
              hint={c("edit")}
              disabled={busy}
              onClick={() => edit(document)}
            >
              <EditIcon aria-hidden="true" />
            </IconButton>
            <IconButton
              label={t(document.archived ? "unarchiveNamed" : "archiveNamed", {
                name: document.name,
              })}
              hint={t(document.archived ? "unarchive" : "archive")}
              disabled={busy}
              onClick={() => void archive(document)}
            >
              {document.archived ? (
                <ArchiveRestoreIcon aria-hidden="true" />
              ) : (
                <ArchiveIcon aria-hidden="true" />
              )}
            </IconButton>
            {document.archived && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void remove(document)}
                className="text-destructive-text"
                aria-label={t("deleteNamed", { name: document.name })}
              >
                <DeleteIcon aria-hidden="true" />
                {t("deletePermanently")}
              </Button>
            )}
          </div>
        </article>
      ))}
      {timeline && (
        <section className="mt-6 space-y-2 border-t border-border pt-4">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="min-w-0 text-sm font-semibold wrap-anywhere">
              {timeline.document.name} · {t("history")}
            </h2>
            <Button
              variant="ghost"
              onClick={() => {
                viewGeneration.current++;
                setTimeline(undefined);
              }}
            >
              {c("close")}
            </Button>
          </header>
          {timeline.versions.map((version) => (
            <Collapsible key={version.revision} className="border-t border-border">
              <CollapsibleTrigger
                render={
                  <Button
                    variant="ghost"
                    className="group h-auto w-full justify-start gap-2 px-0 py-3 text-left text-sm whitespace-normal"
                  />
                }
              >
                <ChevronRightIcon
                  aria-hidden="true"
                  className="shrink-0 group-data-panel-open:rotate-90 motion-safe:transition-transform motion-safe:duration-200 group-focus-visible:transition-none"
                />
                <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="tabular-nums">
                    {t("revision", { revision: String(version.revision) })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(
                      version.reason === "restored" && version.restoredFrom === undefined
                        ? "unarchived"
                        : version.reason,
                    )}{" "}
                    ·{" "}
                    <time dateTime={version.updatedAt} className="tabular-nums">
                      {format.dateTime(new Date(version.updatedAt), "timestamp")}
                    </time>
                  </span>
                  {version.revision === timeline.document.revision && (
                    <Badge variant="secondary">{t("currentRevision")}</Badge>
                  )}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent animated>
                <div className="space-y-3 pb-4 pl-6">
                  <p className="text-sm">{version.name}</p>
                  <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere">
                    {version.content}
                  </pre>
                  {version.restoredFrom && (
                    <p className="text-xs text-muted-foreground">
                      {t("restoredFrom", { revision: String(version.restoredFrom) })}
                    </p>
                  )}
                  <Button
                    variant="outline"
                    disabled={busy || version.revision === timeline.document.revision}
                    onClick={() => void restore(version)}
                  >
                    {t("restoreRevision", { revision: String(version.revision) })}
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
          {timeline.more && (
            <Button variant="outline" disabled={busy} onClick={() => void more()}>
              {t("olderVersions")}
            </Button>
          )}
        </section>
      )}
      {dialog}
      <Dialog
        open={destination !== undefined}
        onOpenChange={(open) => {
          if (!open && !busy) setDestination(undefined);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("unsavedTitle")}</DialogTitle>
            <DialogDescription>{t("unsavedHint")}</DialogDescription>
          </DialogHeader>
          {(error || invalid) && (
            <p role="alert" className="text-destructive-text">
              {t(invalid ? "invalid" : error!)}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setDestination(undefined)}>
              {c("cancel")}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (!destination) return;
                setDestination(undefined);
                void moveEditor(destination);
              }}
            >
              {t("discardChanges")}
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {t("saveContinue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
