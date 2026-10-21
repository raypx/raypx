import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { TaskClient } from "@raypx/client";
import type {
  AgentTask,
  AgentProvider,
  SyncDevice,
  HumanRequest,
  HumanDecision,
  AgentEvent,
} from "@raypx/contracts/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { isTaskActive } from "../index.js";

const failureCodes = [
  "DEVICE_OFFLINE",
  "PROJECT_BUSY",
  "AGENT_UNAVAILABLE",
  "REQUEST_EXPIRED",
  "ALREADY_RESOLVED",
  "REQUEST_CLOSED",
  "DEVICE_REVOKED",
  "SESSION_UNAVAILABLE",
] as const;
function failureCode(error: unknown) {
  if (error && typeof error === "object" && "data" in error) {
    const code = (error as { data?: { error?: { code?: string } } }).data?.error?.code;
    const known = failureCodes.find((item) => item === code);
    if (known) return known;
  }
  return "NETWORK_UNAVAILABLE" as const;
}
function useRemoteQuery<T>(
  load: (signal: AbortSignal) => Promise<T>,
  enabled: boolean,
  client: TaskClient,
) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true,
      loading = false,
      queued = false;
    const controller = new AbortController();
    const poll = async () => {
      if (!active || document.hidden) return;
      if (loading) {
        queued = true;
        return;
      }
      loading = true;
      queued = false;
      try {
        const value = await load(AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]));
        if (active) {
          setData(value);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      } finally {
        loading = false;
        if (queued && active) void poll();
      }
    };
    let unsubscribe: (() => void) | undefined;
    const visible = () => {
      unsubscribe?.();
      unsubscribe = undefined;
      if (!document.hidden) {
        unsubscribe = client.subscribe?.(() => void poll());
        void poll();
      }
    };
    document.addEventListener("visibilitychange", visible);
    visible();
    return () => {
      active = false;
      controller.abort();
      unsubscribe?.();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [load, enabled, revision, client]);
  return {
    data: enabled ? data : undefined,
    error,
    refresh: () => setRevision((value) => value + 1),
  };
}
interface Props {
  client: TaskClient;
  accountId: string | null;
  pending?: boolean;
}
function Gate({ pending }: { pending?: boolean }) {
  const t = useTranslations("tasks");
  return (
    <div className="py-10" aria-busy={pending}>
      {pending ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      ) : (
        <>
          <h2>{t("signIn")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("signInHint")}</p>
        </>
      )}
    </div>
  );
}
export function PendingCount({ client, accountId }: Props) {
  const load = useCallback(
    (signal: AbortSignal) => client.approvals.list({}, { signal }),
    [client],
  );
  const { data } = useRemoteQuery(load, Boolean(accountId), client);
  return data?.length ? (
    <span className="ml-auto rounded bg-muted px-1.5 text-xs tabular-nums">{data.length}</span>
  ) : null;
}
export function TaskWorkspace(props: Props & { view?: "tasks" | "approvals" }) {
  if (!props.accountId || props.pending)
    return (
      <section className="mx-auto max-w-5xl p-8">
        <Gate {...(props.pending === undefined ? {} : { pending: props.pending })} />
      </section>
    );
  return <Workspace key={props.accountId} {...props} accountId={props.accountId} />;
}
function Workspace({ client, view = "tasks" }: Props & { view?: "tasks" | "approvals" }) {
  const t = useTranslations("tasks");
  const c = useTranslations("common");
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [tasks, devices, requests] = await Promise.all([
        client.tasks.list({ limit: 100 }, { signal }),
        client.devices.list({}, { signal }),
        client.approvals.list({}, { signal }),
      ]);
      return { tasks, devices, requests };
    },
    [client],
  );
  const { data, error, refresh } = useRemoteQuery(load, true, client);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <section
      data-tasks
      className="mx-auto max-w-[1400px] px-10 py-10 max-[760px]:px-5 max-[760px]:py-7"
    >
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{t(view === "approvals" ? "inbox" : "title")}</h1>
          <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">
            {t(view === "approvals" ? "inboxHint" : "intro")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh}>
            {c("refresh")}
          </Button>
          {view === "tasks" && (
            <Button onClick={() => setCreating((value) => !value)}>{t("create")}</Button>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {c("networkError")}
        </p>
      )}
      {!data ? (
        <div aria-busy="true" className="h-48 animate-pulse rounded-lg bg-muted" />
      ) : (
        <>
          {creating && (
            <CreateTask
              client={client}
              devices={data.devices}
              tasks={data.tasks}
              onCreated={(task) => {
                setSelected(task.id);
                setCreating(false);
                refresh();
              }}
            />
          )}
          {view === "approvals" ? (
            <div className="space-y-6">
              {data.requests.length === 0 ? (
                <p className="py-10 text-sm text-muted-foreground">{t("nothingWaiting")}</p>
              ) : (
                data.requests.map((request) => (
                  <Approval
                    key={request.id}
                    client={client}
                    request={request}
                    task={data.tasks.find((task) => task.id === request.taskId)}
                    onChanged={refresh}
                  />
                ))
              )}
            </div>
          ) : (
            <div className="task-layout">
              <div>
                {data.tasks.length === 0 ? (
                  <div className="py-10">
                    <h2>{t("empty")}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">{t("emptyHint")}</p>
                  </div>
                ) : (
                  data.tasks.map((task) => (
                    <button
                      type="button"
                      key={task.id}
                      onClick={() => setSelected(task.id)}
                      aria-pressed={selected === task.id}
                      className="flex w-full flex-col gap-2 border-b border-border p-4 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-muted"
                    >
                      <span className="line-clamp-2 text-sm font-medium">{task.prompt}</span>
                      <span className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>{task.provider === "claude" ? "Claude Code" : "Codex"}</span>
                        <span>
                          {data.devices.find((device) => device.id === task.deviceId)?.name}
                        </span>
                        <span>{t(task.status)}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
              <div>
                {selected ? (
                  <TaskDetail key={selected} client={client} id={selected} onChanged={refresh} />
                ) : (
                  <p className="py-10 text-sm text-muted-foreground">{t("selectTask")}</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
function CreateTask({
  client,
  devices,
  tasks,
  onCreated,
}: {
  client: TaskClient;
  devices: SyncDevice[];
  tasks: AgentTask[];
  onCreated: (task: AgentTask) => void;
}) {
  const t = useTranslations("tasks");
  const [deviceId, setDeviceId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [provider, setProvider] = useState<AgentProvider>("claude");
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"run" | "plan">("run");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof failureCode>>();
  const submission = useRef<{ key: string; id: string } | null>(null);
  const device = devices.find((item) => item.id === deviceId);
  const project = device?.projects.find((item) => item.id === projectId);
  const occupied = tasks.some(
    (task) => task.deviceId === deviceId && task.projectId === projectId && isTaskActive(task),
  );
  const available = Boolean(
    device?.online &&
    project?.providers.includes(provider) &&
    device.capabilities.some((c) => c.provider === provider && c.available),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!available || busy || occupied) return;
    const key = JSON.stringify({ deviceId, projectId, provider, prompt, mode });
    if (submission.current?.key !== key) submission.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    setError(undefined);
    try {
      onCreated(
        await client.tasks.create(
          { id: submission.current.id, deviceId, projectId, provider, prompt, mode },
          { signal: AbortSignal.timeout(15_000) },
        ),
      );
    } catch (failure) {
      setError(failureCode(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="mb-8 space-y-4 rounded-lg border border-border bg-sidebar p-5"
    >
      <div className="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
        <label className="task-field">
          {t("device")}
          <select
            required
            value={deviceId}
            onChange={(event) => {
              setDeviceId(event.target.value);
              setProjectId("");
            }}
          >
            <option value="">{t("chooseDevice")}</option>
            {devices
              .filter((d) => !d.revoked)
              .map((d) => (
                <option key={d.id} value={d.id} disabled={!d.online}>
                  {d.name} · {t(d.online ? "online" : "offline")}
                </option>
              ))}
          </select>
        </label>
        <label className="task-field">
          {t("project")}
          <select required value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">{t("chooseProject")}</option>
            {device?.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {project?.dirty && <p className="text-sm text-muted-foreground">{t("dirty")}</p>}
      <div className="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
        <label className="task-field">
          {t("agent")}
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value as AgentProvider)}
          >
            <option value="claude">Claude Code</option>
            <option value="codex">Codex</option>
          </select>
        </label>
        <label className="task-field">
          {t("mode")}
          <select value={mode} onChange={(event) => setMode(event.target.value as "run" | "plan")}>
            <option value="run">{t("runMode")}</option>
            <option value="plan">{t("planMode")}</option>
          </select>
        </label>
      </div>
      <label className="task-field">
        {t("prompt")}
        <textarea
          required
          maxLength={32000}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
      </label>
      <p className="text-xs text-muted-foreground">{t("executionHint")}</p>
      {occupied && (
        <p role="status" className="text-sm">
          {t("PROJECT_BUSY")}
        </p>
      )}
      {!available && <p className="text-sm text-muted-foreground">{t("availabilityHint")}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
      <Button type="submit" disabled={!available || occupied || busy || !prompt.trim()}>
        {t(busy ? "sending" : "send")}
      </Button>
    </form>
  );
}
function TaskDetail({
  client,
  id,
  onChanged,
}: {
  client: TaskClient;
  id: string;
  onChanged: () => void;
}) {
  const t = useTranslations("tasks");
  const c = useTranslations("common");
  const cursor = useRef(0);
  const history = useRef(new Map<number, AgentEvent>());
  const load = useCallback(
    async (signal: AbortSignal) => {
      const result = await client.tasks.get({ id, after: cursor.current }, { signal });
      for (const item of result.events) {
        history.current.set(item.cursor, item.event);
        cursor.current = Math.max(cursor.current, item.cursor);
      }
      return {
        ...result,
        events: [...history.current.entries()].map(([position, event]) => ({
          cursor: position,
          event,
        })),
      };
    },
    [client, id],
  );
  const { data, error, refresh } = useRemoteQuery(load, true, client);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ReturnType<typeof failureCode>>();
  const [prompt, setPrompt] = useState("");
  const followId = useRef<{ prompt: string; id: string } | null>(null);
  async function cancel() {
    setBusy(true);
    try {
      await client.tasks.cancel({ id }, { signal: AbortSignal.timeout(15_000) });
      refresh();
      onChanged();
    } catch (e) {
      setFailure(failureCode(e));
    } finally {
      setBusy(false);
    }
  }
  async function follow(event: FormEvent) {
    event.preventDefault();
    if (followId.current?.prompt !== prompt) followId.current = { prompt, id: crypto.randomUUID() };
    setBusy(true);
    try {
      await client.tasks.followUp(
        { id: followId.current.id, parentTaskId: id, prompt },
        { signal: AbortSignal.timeout(15_000) },
      );
      followId.current = null;
      setPrompt("");
      onChanged();
    } catch (e) {
      setFailure(failureCode(e));
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return <p role={error ? "alert" : "status"}>{c(error ? "networkError" : "loading")}</p>;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2>{t(data.task.status)}</h2>
        {isTaskActive(data.task) && (
          <Button
            variant="outline"
            disabled={busy || data.task.status === "cancelling"}
            onClick={() => void cancel()}
          >
            {c("cancel")}
          </Button>
        )}
      </div>
      <p className="whitespace-pre-wrap text-sm">{data.task.prompt}</p>
      <time className="block text-xs text-muted-foreground" dateTime={data.task.updatedAt}>
        {new Date(data.task.updatedAt).toLocaleString()}
      </time>
      {data.requests.map((request) => (
        <Approval
          key={request.id}
          client={client}
          request={request}
          onChanged={() => {
            refresh();
            onChanged();
          }}
        />
      ))}
      {data.task.summary && (
        <>
          <h3 className="text-sm font-medium">{t("result")}</h3>
          <pre className="task-content">{data.task.summary}</pre>
        </>
      )}
      <details>
        <summary className="cursor-pointer text-sm">{t("activity")}</summary>
        <ol className="mt-3 space-y-2 text-xs text-muted-foreground">
          {data.events.map(
            ({ cursor: eventCursor, event }: { cursor: number; event: AgentEvent }) => (
              <li key={eventCursor}>
                {event.kind === "status"
                  ? t(event.status)
                  : event.kind === "request"
                    ? event.request.title
                    : t("applied")}
              </li>
            ),
          )}
        </ol>
      </details>
      {!isTaskActive(data.task) && (
        <form onSubmit={(event) => void follow(event)} className="space-y-3">
          <label className="task-field">
            {t("followUp")}
            <textarea
              required
              maxLength={32000}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={busy || !prompt.trim()}>
            {t("send")}
          </Button>
        </form>
      )}
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {t(failure)}
        </p>
      )}
    </div>
  );
}
function Approval({
  client,
  request,
  task,
  onChanged,
}: {
  client: TaskClient;
  request: HumanRequest;
  task?: AgentTask | undefined;
  onChanged: () => void;
}) {
  const t = useTranslations("tasks");
  const [note, setNote] = useState("");
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof failureCode>>();
  const closed = request.status !== "pending";
  async function decide(decision: HumanDecision) {
    setBusy(true);
    try {
      await client.approvals.decide(
        { id: request.id, decision },
        { signal: AbortSignal.timeout(15_000) },
      );
      onChanged();
    } catch (failure) {
      setError(failureCode(failure));
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-lg border border-border p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-medium">{request.title || t(request.kind)}</h3>
        <span className="text-xs text-muted-foreground">{t(request.status)}</span>
      </div>
      {task && <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{task.prompt}</p>}
      {request.body && <pre className="task-content">{request.body}</pre>}
      {!closed && (
        <div className="mt-4 space-y-4">
          {request.questions.map((question) => (
            <fieldset key={question.id} className="space-y-2">
              <legend className="mb-2 text-sm font-medium">{question.text}</legend>
              {question.options.map((option) => (
                <label key={option.label} className="flex items-start gap-2 text-sm">
                  <input
                    className="mt-1"
                    type={question.multiSelect ? "checkbox" : "radio"}
                    name={`${request.id}:${question.id}`}
                    checked={answers[question.id]?.includes(option.label) ?? false}
                    onChange={(event) =>
                      setAnswers((previous) => ({
                        ...previous,
                        [question.id]: question.multiSelect
                          ? event.target.checked
                            ? [...(previous[question.id] ?? []), option.label]
                            : (previous[question.id] ?? []).filter((item) => item !== option.label)
                          : [option.label],
                      }))
                    }
                  />
                  <span>
                    {option.label}
                    <small className="block text-muted-foreground">{option.description}</small>
                  </span>
                </label>
              ))}
              <label className="task-field">
                {t("customAnswer")}
                <input
                  value={
                    answers[question.id]?.every((value) =>
                      question.options.every((option) => option.label !== value),
                    )
                      ? (answers[question.id]?.join(", ") ?? "")
                      : ""
                  }
                  onChange={(event) =>
                    setAnswers((previous) => ({
                      ...previous,
                      [question.id]: event.target.value ? [event.target.value] : [],
                    }))
                  }
                />
              </label>
            </fieldset>
          ))}
          <label className="task-field">
            {t("note")}
            <textarea
              value={note}
              maxLength={8000}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                busy ||
                (request.kind === "question" &&
                  request.questions.some((q) => !answers[q.id]?.length))
              }
              onClick={() =>
                void decide(
                  request.kind === "question" ? { type: "answer", answers } : { type: "allow" },
                )
              }
            >
              {t(
                request.kind === "question"
                  ? "submitAnswer"
                  : request.kind === "plan"
                    ? "approvePlan"
                    : "allowOnce",
              )}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void decide({ type: "deny", note })}
            >
              {t(request.kind === "plan" ? "revisePlan" : "deny")}
            </Button>
          </div>
        </div>
      )}
      {request.status === "decided" && (
        <p className="mt-3 text-xs text-muted-foreground">{t("awaitingDevice")}</p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {t(error)}
        </p>
      )}
    </section>
  );
}
export function DeviceSettings({ client, accountId, pending }: Props) {
  if (!accountId || pending) return <Gate {...(pending === undefined ? {} : { pending })} />;
  return <Devices key={accountId} client={client} />;
}
function Devices({ client }: { client: TaskClient }) {
  const t = useTranslations("tasks");
  const load = useCallback((signal: AbortSignal) => client.devices.list({}, { signal }), [client]);
  const { data, error, refresh } = useRemoteQuery(load, true, client);
  const [busy, setBusy] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState(false);
  async function revoke(device: SyncDevice) {
    if (!window.confirm(t("revokeConfirm"))) return;
    setBusy(device.id);
    try {
      await client.devices.revoke({ deviceId: device.id, epoch: device.epoch });
      refresh();
    } catch {
      setMutationError(true);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="mt-8 border-t border-border pt-7" data-tasks>
      <h2 className="text-base">{t("devices")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("devicesHint")}</p>
      {(error || mutationError) && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {t("NETWORK_UNAVAILABLE")}
        </p>
      )}
      {data?.length === 0 && <p className="mt-5 text-sm text-muted-foreground">{t("noDevices")}</p>}
      {data?.map((device) => (
        <div
          key={device.id}
          className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-5"
        >
          <div>
            <h3 className="text-sm font-medium">{device.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {device.platform} ·{" "}
              {t(device.revoked ? "revoked" : device.online ? "online" : "offline")}
              {device.lastSeenAt && <> · {new Date(device.lastSeenAt).toLocaleString()}</>}
            </p>
          </div>
          {!device.revoked && (
            <Button
              variant="outline"
              disabled={busy === device.id}
              onClick={() => void revoke(device)}
            >
              {t("revoke")}
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
