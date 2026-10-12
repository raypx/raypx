import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createApiRunTransport, createRunSession } from "@voidmix/client/runs";
import type { ApiClient } from "@voidmix/client";
import type { AgentRunDto, DeviceDto, RunArtifactDto } from "@voidmix/contracts";
import { Composer } from "@voidmix/agent-ui/composer";
import { RunControls, RunTimeline, type RunTimelineProps } from "@voidmix/agent-ui/runs";
import { ArtifactList, ArtifactPreview, type ArtifactContent } from "@voidmix/agent-ui/artifacts";
import { isRunTerminal, projectRunEvents } from "@voidmix/agent-ui/model";
import { Button } from "@voidmix/ui/components/ui/button";
import { Field, FieldLabel } from "@voidmix/ui/components/ui/field";
import { EmptyState } from "@voidmix/ui/empty-state";
import { createDesktopApiClient, desktopApiOptions } from "../../lib/api-client";
import { useDesktopTranslations } from "../../i18n/client";

type Task = { id: string; title: string };
type Translate = ReturnType<typeof useDesktopTranslations<"runs">>;
function useApi() {
  return useMemo(() => createDesktopApiClient(), []);
}
function useTransport() {
  return useMemo(() => createApiRunTransport(desktopApiOptions()), []);
}

export function RunPanel({
  accountId,
  projectId,
  tasks,
  writable,
}: {
  accountId: string;
  projectId: string;
  tasks: readonly Task[];
  writable: boolean;
}) {
  const t = useDesktopTranslations("runs");
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? "");
  const selected = tasks.find((task) => task.id === taskId) ?? tasks[0];
  return (
    <section
      className="flex min-w-0 flex-col gap-4 border-t border-border pt-6"
      aria-label={t("title")}
    >
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      {!selected ? (
        <EmptyState title={t("noTasks")} description={t("noTasksDescription")} />
      ) : (
        <>
          <Field>
            <FieldLabel htmlFor="run-task">{t("task")}</FieldLabel>
            <select
              id="run-task"
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
              value={selected.id}
              onChange={(event) => setTaskId(event.target.value)}
            >
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </Field>
          <TaskRuns
            key={`${accountId}:${projectId}:${selected.id}`}
            projectId={projectId}
            task={selected}
            writable={writable}
          />
        </>
      )}
    </section>
  );
}

function TaskRuns({
  projectId,
  task,
  writable,
}: {
  projectId: string;
  task: Task;
  writable: boolean;
}) {
  const t = useDesktopTranslations("runs");
  const api = useApi();
  const [runs, setRuns] = useState<AgentRunDto[]>([]);
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [runId, setRunId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [draft, setDraft] = useState("");
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    setLoading(true);
    setFailed(false);
    void Promise.all([
      api.projects.agentRuns.list({ projectId, taskId: task.id, limit: 50 }, options),
      api.devices.list({}, options).then(async (page) => {
        const bound = await Promise.all(
          page.items
            .filter((device) => !device.revokedAt)
            .map(async (device) => {
              const bindings = await api.devices.listBindings({ deviceId: device.id }, options);
              return bindings.items.some(
                (binding) => binding.projectId === projectId && binding.enabled,
              )
                ? device
                : null;
            }),
        );
        return bound.filter((device): device is DeviceDto => device !== null);
      }),
    ])
      .then(([page, available]) => {
        if (controller.signal.aborted) return;
        setRuns(page.items);
        setDevices(available);
        setRunId((current) => current || page.items[0]?.id || "");
        setDeviceId((current) =>
          available.some((device) => device.id === current) ? current : (available[0]?.id ?? ""),
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, projectId, task.id, revision]);
  async function create(prompt: string) {
    const run = await api.projects.agentRuns.create({
      projectId,
      taskId: task.id,
      targetDeviceId: deviceId,
      prompt,
      idempotencyKey: crypto.randomUUID(),
      input: {},
    });
    if (!alive.current) return;
    setDraft("");
    setRunId(run.id);
    setRuns((current) => [run, ...current]);
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {loading ? <p role="status">{t("loading")}</p> : null}
      {failed ? (
        <div role="alert">
          <p>{t("failed")}</p>
          <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>
            {t("refresh")}
          </Button>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="run-history">{t("history")}</FieldLabel>
          <select
            id="run-history"
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
            value={runId}
            onChange={(event) => setRunId(event.target.value)}
          >
            <option value="">{t("noRuns")}</option>
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {t("attempt", { count: run.attempt })} · {run.prompt.slice(0, 64)}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="run-device">{t("device")}</FieldLabel>
          <select
            id="run-device"
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
            value={deviceId}
            onChange={(event) => setDeviceId(event.target.value)}
          >
            <option value="">{t("noDevice")}</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {runId ? (
        <SelectedRun
          key={runId}
          api={api}
          runId={runId}
          writable={writable}
          onRetry={(run) => {
            if (alive.current) {
              setRunId(run.id);
              setRuns((current) => [run, ...current]);
            }
          }}
        />
      ) : null}
      <Composer
        value={draft}
        onValueChange={setDraft}
        onSubmit={create}
        context={task.title}
        {...(!writable
          ? { disabledReason: t("readOnly") }
          : !deviceId
            ? { disabledReason: t("noDeviceDescription") }
            : loading || failed
              ? { disabledReason: t("loading") }
              : {})}
        labels={{
          label: t("prompt"),
          placeholder: t("placeholder"),
          submit: t("submit"),
          submitting: t("submitting"),
          failed: t("failed"),
          hint: t("hint"),
        }}
      />
    </div>
  );
}

function timelineLabels(t: Translate): RunTimelineProps["labels"] {
  return {
    title: t("timeline"),
    empty: t("waiting"),
    emptyDescription: t("waitingDescription"),
    user: t("user"),
    assistant: t("assistant"),
    latest: t("latest"),
    artifact: t("artifact"),
    status: {
      queued: t("queued"),
      running: t("running"),
      waiting_for_approval: t("waiting_for_approval"),
      succeeded: t("succeeded"),
      failed: t("failedStatus"),
      cancelled: t("cancelled"),
    },
    tool: {
      input: t("toolInput"),
      output: t("toolOutput"),
      running: t("toolRunning"),
      succeeded: t("toolSucceeded"),
      failed: t("toolFailed"),
    },
    approval: {
      title: t("approval"),
      approve: t("approve"),
      deny: t("deny"),
      pending: t("pendingCommand"),
      approved: t("approved"),
      denied: t("denied"),
    },
  };
}
function SelectedRun({
  api,
  runId,
  writable,
  onRetry,
}: {
  api: ApiClient;
  runId: string;
  writable: boolean;
  onRetry(run: AgentRunDto): void;
}) {
  const t = useDesktopTranslations("runs");
  const transport = useTransport();
  const [session] = useState(() => createRunSession({ runId, transport }));
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [steer, setSteer] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    session.reconnect();
    return () => {
      mounted.current = false;
      session.dispose();
    };
  }, [session]);
  const items = useMemo(() => projectRunEvents(snapshot.events), [snapshot.events]);
  const labels = timelineLabels(t);
  const pendingCommands = snapshot.commands.filter((command) => command.status === "pending");
  async function action(key: string, operation: () => Promise<unknown>) {
    if (pending) return;
    setPending(key);
    setFailed(false);
    try {
      await operation();
      if (mounted.current) session.reconnect();
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      if (mounted.current) setPending(null);
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {snapshot.error ? (
        <div role="alert">
          <p>{t("connectionFailed")}</p>
          <Button variant="outline" onClick={() => session.reconnect()}>
            {t("refresh")}
          </Button>
        </div>
      ) : null}
      {snapshot.connection === "connecting" || snapshot.connection === "reconnecting" ? (
        <p role="status">{t("connecting")}</p>
      ) : null}
      {snapshot.run ? (
        <RunControls
          status={snapshot.run.status}
          cancelPending={
            pending === "cancel" || pendingCommands.some((command) => command.type === "cancel")
          }
          retryPending={pending === "retry"}
          {...(writable
            ? {
                onCancel: () => {
                  void action("cancel", () =>
                    api.projects.agentRuns.cancel({ runId, idempotencyKey: crypto.randomUUID() }),
                  );
                },
                onRetry: () => {
                  void action("retry", async () => {
                    const run = await api.projects.agentRuns.retry({
                      runId,
                      idempotencyKey: crypto.randomUUID(),
                    });
                    if (mounted.current) onRetry(run);
                  });
                },
              }
            : {})}
          labels={{
            status: labels.status,
            cancel: t("cancel"),
            cancelling: t("pendingCommand"),
            retry: t("retry"),
            retrying: t("retrying"),
          }}
        />
      ) : null}
      {failed ? <p role="alert">{t("failed")}</p> : null}
      {snapshot.commands.some((command) => command.status === "rejected") ? (
        <p role="alert">{t("rejectedCommand")}</p>
      ) : null}
      <RunTimeline
        items={items}
        {...(snapshot.run
          ? { prompt: snapshot.run.prompt, streaming: !isRunTerminal(snapshot.run.status) }
          : {})}
        pendingApprovalIds={[
          ...pendingCommands
            .filter((command) => command.type === "approval")
            .map((command) => String(command.payload.approvalId)),
          ...(pending?.startsWith("approval:") ? [pending.slice(9)] : []),
        ]}
        {...(writable
          ? {
              onDecision: (approvalId: string, decision: "approve" | "deny") => {
                void action(`approval:${approvalId}`, () =>
                  api.projects.agentRuns.commands.create({
                    runId,
                    idempotencyKey: crypto.randomUUID(),
                    type: "approval",
                    payload: { approvalId, decision },
                  }),
                );
              },
            }
          : {})}
        labels={labels}
      />
      {writable && snapshot.run && !isRunTerminal(snapshot.run.status) ? (
        <Composer
          value={steer}
          onValueChange={setSteer}
          pending={pendingCommands.some((command) => command.type === "steer")}
          onSubmit={async (prompt) => {
            await api.projects.agentRuns.commands.create({
              runId,
              idempotencyKey: crypto.randomUUID(),
              type: "steer",
              payload: { prompt },
            });
            if (mounted.current) {
              setSteer("");
              session.reconnect();
            }
          }}
          labels={{
            label: t("steer"),
            placeholder: t("steerPlaceholder"),
            submit: t("steerSubmit"),
            submitting: t("pendingCommand"),
            failed: t("failed"),
            hint: t("steerHint"),
          }}
        />
      ) : null}
      <RunArtifacts key={runId} api={api} artifacts={snapshot.artifacts} />
    </div>
  );
}
function RunArtifacts({
  api,
  artifacts,
}: {
  api: ApiClient;
  artifacts: readonly RunArtifactDto[];
}) {
  const t = useDesktopTranslations("runs");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = artifacts.find((artifact) => artifact.id === selectedId);
  const assetVersionId = selected?.assetVersionId;
  const [content, setContent] = useState<ArtifactContent>();
  const [download, setDownload] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!assetVersionId) return;
    const controller = new AbortController();
    let url: string | undefined;
    setLoading(true);
    setFailed(false);
    setContent(undefined);
    setDownload(undefined);
    void api.projects.assets.versions
      .download({ assetVersionId }, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        const bytes = Uint8Array.from(atob(result.bodyBase64), (character) =>
          character.charCodeAt(0),
        );
        url = URL.createObjectURL(new Blob([bytes], { type: result.mediaType }));
        setDownload(url);
        setContent(
          result.mediaType.startsWith("text/") || result.mediaType === "application/json"
            ? { kind: "text", text: new TextDecoder().decode(bytes) }
            : ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(result.mediaType)
              ? { kind: "image", src: url }
              : { kind: "file" },
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [api, assetVersionId]);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ArtifactList
        artifacts={artifacts.map(({ id, name }) => ({ id, name }))}
        {...(selected ? { selectedId: selected.id } : {})}
        onSelect={(file) => setSelectedId(file.id)}
        labels={{ title: t("artifacts"), empty: t("noArtifacts") }}
      />
      {selected ? (
        <ArtifactPreview
          name={selected.name}
          {...(content ? { content } : {})}
          pending={loading}
          {...(failed ? { error: t("failed") } : {})}
          {...(download
            ? {
                onDownload: () => {
                  const link = document.createElement("a");
                  link.href = download;
                  link.download = selected.name;
                  link.click();
                },
              }
            : {})}
          labels={{
            loading: t("loading"),
            unavailable: t("previewUnavailable"),
            download: t("download"),
          }}
        />
      ) : null}
    </div>
  );
}
