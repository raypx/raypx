import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useCloudQueries } from "../../lib/use-cloud-queries";
import { invalidateRunFacts } from "../../lib/cloud-queries";
import { createConversationProjection } from "@voidmix/agent-ui/model";
import { Link } from "@tanstack/react-router";
import type {
  CloudAssetVersionDto,
  CloudConversationSnapshotDto,
  CloudRunSnapshotDto,
} from "@voidmix/contracts";
import {
  createConversationSession,
  createConversationTransport,
} from "@voidmix/client/conversations";
import { Composer } from "@voidmix/agent-ui/composer";
import { ConversationFeed } from "@voidmix/agent-ui/conversation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@voidmix/ui/components/ui/tabs";
import { Button } from "@voidmix/ui/components/ui/button";
import { Field, FieldLabel } from "@voidmix/ui/components/ui/field";
import { env } from "../../env";
import { useTranslations } from "../../i18n/client";
import { createWebApiClient } from "../../lib/api-client";
import { captureProductEvent } from "../../lib/product-telemetry";
import { InputAttachments } from "../files/input-attachments";
import { uploadInputFile } from "../files/upload";
import { CloudRunView } from "../runs/cloud-run-view";

function subscribeWide(listener: () => void) {
  const media = window.matchMedia("(min-width: 1024px)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
function getWide() {
  return window.matchMedia("(min-width: 1024px)").matches;
}

export function ConversationWorkspace({
  initial,
  writable,
}: {
  initial: CloudConversationSnapshotDto;
  writable: boolean;
}) {
  const t = useTranslations("cloud");
  const wide = useSyncExternalStore(subscribeWide, getWide, () => false);
  const [panel, setPanel] = useState("conversation");
  const { queries, identity, resources, queryClient } = useCloudQueries();
  const { data: capabilities } = useSuspenseQuery({
    ...queries.capabilities(),
    refetchInterval: 15_000,
  });
  const [projectMessages] = useState(() => createConversationProjection());
  const [taskAction, setTaskAction] = useState<"newTask" | "newRound" | "continueRound">("newTask");
  const api = useMemo(() => createWebApiClient(), []);
  const [session] = useState(() =>
    createConversationSession({
      conversationId: initial.conversation.id,
      initialSnapshot: initial,
      transport: createConversationTransport(initial.conversation.id, {
        ...(env.VITE_API_URL ? { baseUrl: env.VITE_API_URL } : {}),
        fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
      }),
    }),
  );
  const connection = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const data = connection.data ?? initial;
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"search" | "computer">(data.turns.at(-1)?.mode ?? "search");
  const [selection, setSelection] = useState<string>();
  const [activeSnapshot, setActiveSnapshot] = useState<CloudRunSnapshotDto | null>(null);
  const [attachments, setAttachments] = useState<CloudAssetVersionDto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  const uploadIntents = useRef(new Map<string, string>());
  const sendIntent = useRef<{
    fingerprint: string;
    key: string;
    roundId?: string;
    goalVersion?: number;
    expectedGoalVersion?: number;
  } | null>(null);
  const latest = [...data.runs].sort((a, b) => b.createdAt.valueOf() - a.createdAt.valueOf())[0];
  const selected = data.runs.find((run) => run.id === selection) ?? latest;
  const taskId = selected?.taskId;
  const taskQuery = useQuery({ ...queries.task(taskId ?? ""), enabled: Boolean(taskId) });
  const selectedTask = taskQuery.data?.task;
  const canContinue = Boolean(
    selectedTask &&
    selected?.roundId === selectedTask.currentRoundId &&
    selectedTask.status !== "cancelled" &&
    selectedTask.status !== "completed",
  );
  const canStartRound = Boolean(selectedTask && selectedTask.status !== "cancelled");
  const active = data.runs.some((run) => run.status === "queued" || run.status === "running");
  useEffect(() => {
    if (connection.connection === "failed") resources.files.disposeAccount(identity.accountId);
  }, [connection.connection, resources, identity.accountId]);
  useEffect(() => {
    lifetime.current = new AbortController();
    session.reconnect();
    const unregister = resources.register(identity.accountId, session.dispose);
    return () => {
      unregister();
      lifetime.current?.abort();
      session.dispose();
    };
  }, [session, resources, identity.accountId]);
  const updateSnapshot = useCallback(
    (snapshot: CloudRunSnapshotDto) => setActiveSnapshot(snapshot),
    [],
  );
  const refresh = useCallback(() => {
    session.refresh();
  }, [session]);
  async function send(prompt: string) {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted) return;
    const fingerprint = JSON.stringify({
      prompt,
      mode,
      taskId: mode === "computer" && taskAction !== "newTask" ? taskId : null,
      taskAction,
      goalVersion: taskAction === "continueRound" ? selectedTask?.goalVersion : null,
      roundId: taskAction === "continueRound" ? selectedTask?.currentRoundId : null,
      attachments: attachments.map((asset) => asset.id),
    });
    if (sendIntent.current?.fingerprint !== fingerprint)
      sendIntent.current = {
        fingerprint,
        key: crypto.randomUUID(),
        ...(selectedTask && taskAction === "newRound"
          ? { expectedGoalVersion: selectedTask.goalVersion }
          : {}),
      };
    const intent = sendIntent.current;
    const input = {
      conversationId: data.conversation.id,
      prompt,
      mode,
      attachmentIds: attachments.map((asset) => asset.id),
      idempotencyKey: intent.key,
    };
    let result;
    if (mode === "computer" && taskAction !== "newTask") {
      if (!selectedTask || (taskAction === "continueRound" ? !canContinue : !canStartRound))
        throw { code: "ROUND_CONTEXT_CHANGED" };
      if (taskAction === "continueRound")
        result = await api.cloud.tasks.continueRound(
          {
            ...input,
            taskId: selectedTask.id,
            roundId: selectedTask.currentRoundId,
            goalVersion: selectedTask.goalVersion,
          },
          { signal },
        );
      else {
        if (!intent.roundId || !intent.goalVersion) {
          const next = await api.cloud.tasks.startRound(
            {
              taskId: selectedTask.id,
              expectedGoalVersion: intent.expectedGoalVersion ?? selectedTask.goalVersion,
              goal: prompt,
              attachmentIds: input.attachmentIds,
              idempotencyKey: intent.key,
            },
            { signal },
          );
          if (signal.aborted) return;
          intent.roundId = next.round.id;
          intent.goalVersion = next.round.goalVersion;
        }
        result = await api.cloud.conversations.sendTurn(
          {
            ...input,
            taskId: selectedTask.id,
            roundId: intent.roundId,
            goalVersion: intent.goalVersion,
          },
          { signal },
        );
      }
    } else result = await api.cloud.conversations.sendTurn(input, { signal });
    if (signal.aborted) return;
    sendIntent.current = null;
    setDraft("");
    setAttachments([]);
    setSelection(result.run.id);
    resources.markCreated(identity.accountId, result.run.id);
    setTaskAction(result.task ? "continueRound" : "newTask");
    void invalidateRunFacts(queryClient, identity, result.run.taskId);
    captureProductEvent("turn_sent", { mode });
    if (result.task && taskAction === "newTask") captureProductEvent("task_created", { mode });
    session.refresh();
  }
  async function upload(file: File) {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || uploading) return;
    setUploading(true);
    setUploadFailed(false);
    try {
      const asset = await uploadInputFile(
        api,
        file,
        signal,
        data.conversation.scope.type === "project" ? data.conversation.scope.projectId : undefined,
        uploadIntents.current,
      );
      if (!signal.aborted) setAttachments((items) => [...items, asset]);
    } catch {
      if (!signal.aborted) setUploadFailed(true);
    } finally {
      if (!signal.aborted) setUploading(false);
    }
  }
  const disabledReason = !writable
    ? t("readOnly")
    : !capabilities[mode]
      ? t("capabilityOff")
      : capabilities.unavailableReason
        ? t("unavailable")
        : active
          ? t("running")
          : mode === "computer" &&
              ((taskAction === "continueRound" && !canContinue) ||
                (taskAction === "newRound" && !canStartRound))
            ? t("readOnly")
            : uploading
              ? t("uploading")
              : undefined;
  if (connection.connection === "failed")
    return (
      <div role="alert" className="space-y-3">
        <p>{t("connection")}</p>
        <Button variant="outline" onClick={() => session.reconnect()}>
          {t("reconnect")}
        </Button>
      </div>
    );
  const composer = (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="conversation-mode">{t("mode")}</FieldLabel>
        <select
          id="conversation-mode"
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          value={mode}
          onChange={(event) => setMode(event.target.value as "search" | "computer")}
        >
          <option value="search" disabled={!capabilities.search}>
            {t("search")}
          </option>
          <option value="computer" disabled={!capabilities.computer}>
            {t("computer")}
          </option>
        </select>
      </Field>
      {mode === "computer" ? (
        <Field>
          <FieldLabel htmlFor="task-action">{t("taskAction")}</FieldLabel>
          <select
            id="task-action"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            value={taskAction}
            onChange={(event) =>
              setTaskAction(event.target.value as "newTask" | "newRound" | "continueRound")
            }
          >
            <option value="newTask">{t("newTask")}</option>
            <option value="continueRound" disabled={!canContinue}>
              {t("continueRound")}
              {selectedTask ? ` · ${selectedTask.goalVersion}` : ""}
            </option>
            <option value="newRound" disabled={!canStartRound}>
              {t("newRound")}
            </option>
          </select>
          {taskAction !== "newTask" && selectedTask ? (
            <p className="text-sm text-muted-foreground">
              {t("currentGoal")}: {selectedTask.goal}
            </p>
          ) : null}
        </Field>
      ) : null}
      <InputAttachments
        attachments={attachments}
        uploading={uploading}
        failed={uploadFailed}
        disabled={!writable}
        onUpload={(file) => void upload(file)}
        onRemove={(id) => setAttachments((items) => items.filter((item) => item.id !== id))}
      />
      <Composer
        value={draft}
        onValueChange={setDraft}
        onSubmit={send}
        {...(disabledReason ? { disabledReason } : {})}
        labels={{
          label: t("prompt"),
          placeholder: t("placeholder"),
          submit: mode === "computer" ? t(taskAction) : t("submit"),
          submitting: t("submitting"),
          failed: t("failed"),
          hint: t("hint"),
        }}
      />
    </div>
  );
  const feed = (
    <>
      <div>
        {data.historyCursor ? (
          <Button
            variant="outline"
            disabled={connection.historyLoading}
            onClick={() => void session.loadHistory()}
          >
            {connection.historyLoading ? t("loading") : t("loadHistory")}
          </Button>
        ) : null}
        {connection.historyError ? (
          <p role="alert" className="text-sm">
            {t("failed")}
          </p>
        ) : null}
      </div>
      <ConversationFeed
        messages={projectMessages(
          data,
          activeSnapshot?.run.id === selected?.id ? activeSnapshot : null,
        )}
        labels={{
          title: t("feed"),
          user: t("user"),
          assistant: t("assistant"),
          latest: t("latest"),
          empty: t("emptyFeed"),
        }}
      />
    </>
  );
  const details = selected ? (
    <CloudRunView
      key={selected.id}
      api={api}
      runId={selected.id}
      writable={writable}
      onSnapshot={updateSnapshot}
      onFinished={refresh}
      onRetry={(runId) => {
        setSelection(runId);
        session.refresh();
      }}
    />
  ) : (
    <p className="text-sm text-muted-foreground">{t("noHistory")}</p>
  );
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{data.conversation.title}</h1>
        {taskId ? (
          <Link to="/tasks/$taskId" params={{ taskId }} className="text-sm underline">
            {t("openTask")}
          </Link>
        ) : null}
      </header>
      {connection.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <p>{t("connection")}</p>
          <Button variant="outline" onClick={() => session.reconnect()}>
            {t("reconnect")}
          </Button>
        </div>
      ) : null}
      {data.runs.length ? (
        <Field>
          <FieldLabel htmlFor="conversation-run">{t("history")}</FieldLabel>
          <select
            id="conversation-run"
            className="max-w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            value={selected?.id ?? ""}
            onChange={(event) => {
              setSelection(event.target.value);
              setTaskAction("newTask");
            }}
          >
            {[...data.runs]
              .sort((a, b) => b.createdAt.valueOf() - a.createdAt.valueOf())
              .map((run) => (
                <option key={run.id} value={run.id}>
                  {run.prompt.slice(0, 70)} · {run.attempt}
                </option>
              ))}
          </select>
        </Field>
      ) : null}
      <Tabs
        value={panel}
        onValueChange={(value) => setPanel(String(value))}
        className="min-w-0 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8"
      >
        <TabsList aria-label={t("feed")} className="lg:hidden">
          <TabsTrigger value="conversation">{t("feed")}</TabsTrigger>
          <TabsTrigger value="execution">{t("execution")}</TabsTrigger>
        </TabsList>
        <TabsContent
          keepMounted
          value="conversation"
          hidden={!wide && panel !== "conversation"}
          inert={!wide && panel !== "conversation"}
          {...(wide ? { role: "region", "aria-label": t("feed") } : {})}
          className="min-w-0 space-y-6 lg:block!"
        >
          {feed}
          {composer}
        </TabsContent>
        <TabsContent
          keepMounted
          value="execution"
          hidden={!wide && panel !== "execution"}
          inert={!wide && panel !== "execution"}
          {...(wide ? { role: "region", "aria-label": t("execution") } : {})}
          className="min-w-0 pt-4 lg:block! lg:border-l lg:border-border lg:pt-0 lg:pl-6"
        >
          {details}
        </TabsContent>
      </Tabs>
    </div>
  );
}
