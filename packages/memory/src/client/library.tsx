import { useCallback, useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { SelectField } from "@raypx/ui/select-field";
import { useConfirmation } from "@raypx/ui/confirmation";
import { LoadingState } from "@raypx/ui/loading-state";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { Archive, ChevronRight, History, Pencil, Plus, Trash2 } from "lucide-react";
import type {
  ContextDocument,
  ContextDocumentInput,
  ContextDocumentSummary,
  ContextVersion,
} from "../model.js";
import type { MemoryClientPort, MemoryProjectsPort, MemoryUsagePort } from "./port.js";
import { memoryClientKey, memoryFailure, useMemoryRequests } from "./request.js";
import { DocumentForm } from "./form.js";
interface Props {
  client: MemoryClientPort;
  ownerKey: string;
  scope: "device" | "account";
  projects?: MemoryProjectsPort;
  usage?: MemoryUsagePort;
}
export function MemoryLibraryPage(props: Props) {
  return (
    <Library
      key={JSON.stringify([
        props.ownerKey,
        memoryClientKey(props.client),
        props.projects && memoryClientKey(props.projects),
        props.usage && memoryClientKey(props.usage),
      ])}
      {...props}
    />
  );
}
function Library({ client, projects: projectPort, usage, scope }: Props) {
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
    setError(
      docs.status === "rejected"
        ? memoryFailure(docs.reason)
        : targets.status === "rejected"
          ? memoryFailure(targets.reason)
          : undefined,
    );
    setLoading(false);
  }, [isActive, client, projectPort, request]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function mutate(run: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await run();
    } catch (failure) {
      if (isActive()) setError(memoryFailure(failure));
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
  async function edit(document: ContextDocumentSummary) {
    const current = ++viewGeneration.current;
    try {
      const value = await request((options) => client.get({ id: document.id }, options));
      if (isActive() && current === viewGeneration.current) {
        setEditing(value);
        setError(undefined);
      }
    } catch (failure) {
      if (isActive() && current === viewGeneration.current) setError(memoryFailure(failure));
    }
  }
  async function save(document: ContextDocumentInput) {
    await mutate(async () => {
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
              return t("scheduledPlanPreview", {
                name,
                status: t(plan.enabled ? "planEnabled" : "planPaused"),
              });
            });
            description += ` ${t("scheduledPlansCount", { count: String(plans.length) })}`;
            if (preview.length) description += ` ${preview.join("; ")}.`;
            if (plans.length > 3)
              description += ` ${t("scheduledPlansMore", { count: String(plans.length - 3) })}`;
          } else description += ` ${t("scheduledPlansUnknown")}`;
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
  const shown = documents?.filter(
    (document) => (archived || !document.archived) && (kind === "all" || document.kind === kind),
  );
  return (
    <section>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{t("title")}</h1>
          <p className="mt-2 max-w-[70ch] text-sm text-muted-foreground">
            {t(scope === "device" ? "deviceHint" : "accountHint")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={loading || busy}
            onClick={() => {
              setLoading(true);
              void load();
            }}
          >
            {c("refresh")}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              if (editing === null) return;
              viewGeneration.current++;
              setEditing(null);
              setError(undefined);
            }}
          >
            <Plus aria-hidden="true" />
            {t("create")}
          </Button>
        </div>
      </header>
      <p className="mb-6 max-w-[75ch] text-xs text-muted-foreground">{t("referenceHint")}</p>
      <p className="mb-5 max-w-[75ch] text-xs text-muted-foreground">{t("quotaHint")}</p>
      {error && (
        <p role="alert" className="mb-5 text-sm text-destructive-text">
          {t(error)}
        </p>
      )}
      {editing !== false && (
        <DocumentForm
          key={editing ? `${editing.id}:${editing.revision}` : "new"}
          document={editing}
          projects={projects}
          busy={busy}
          onSave={save}
          onCancel={() => {
            viewGeneration.current++;
            if (editing === null) creation.current = undefined;
            setEditing(false);
          }}
        />
      )}
      <div className="mb-5 flex flex-wrap items-center gap-5">
        <SelectField
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
      {!documents && loading && <LoadingState label={c("loading")} />}
      {shown?.length === 0 && <p className="py-10 text-sm text-muted-foreground">{t("empty")}</p>}
      {shown?.map((document) => (
        <article
          key={document.id}
          className="flex flex-wrap items-start gap-4 border-t border-border py-4"
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-medium wrap-anywhere">{document.name}</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              {t(document.kind)} · {document.category || t("uncategorized")} ·{" "}
              {t("revision", { revision: String(document.revision) })} ·{" "}
              {document.archived
                ? t("archived")
                : document.project
                  ? (projects.find(
                      (project) =>
                        project.deviceId === document.project?.deviceId &&
                        project.projectId === document.project?.projectId,
                    )?.name ?? t("projectUnavailable"))
                  : t("global")}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" disabled={busy} onClick={() => void history(document)}>
              <History aria-hidden="true" />
              {t("history")}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void edit(document)}
              aria-label={t("editNamed", { name: document.name })}
            >
              <Pencil aria-hidden="true" />
              {c("edit")}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void archive(document)}
              aria-label={t(document.archived ? "unarchiveNamed" : "archiveNamed", {
                name: document.name,
              })}
            >
              <Archive aria-hidden="true" />
              {t(document.archived ? "unarchive" : "archive")}
            </Button>
            {document.archived && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void remove(document)}
                className="text-destructive-text"
                aria-label={t("deleteNamed", { name: document.name })}
              >
                <Trash2 aria-hidden="true" />
                {t("deletePermanently")}
              </Button>
            )}
          </div>
        </article>
      ))}
      {timeline && (
        <section className="mt-8 space-y-3">
          <header className="flex items-center justify-between gap-3">
            <h2 className="text-base font-medium">
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
                    className="group h-auto w-full justify-start gap-3 px-0 py-3 text-sm"
                  />
                }
              >
                <ChevronRight aria-hidden="true" className="group-data-panel-open:rotate-90" />
                {t("revision", { revision: String(version.revision) })}{" "}
                <span className="text-xs text-muted-foreground">
                  {t(
                    version.reason === "restored" && version.restoredFrom === undefined
                      ? "unarchived"
                      : version.reason,
                  )}{" "}
                  · {format.dateTime(new Date(version.updatedAt), "timestamp")}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pb-4">
                <p className="text-sm">{version.name}</p>
                <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap wrap-anywhere">
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
    </section>
  );
}
