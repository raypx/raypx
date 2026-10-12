import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ApiClient } from "@voidmix/client";
import type { CloudRunSnapshotDto, CloudCommandDto } from "@voidmix/contracts";
import { createCloudRunSession, createCloudRunTransport } from "@voidmix/client/cloud-runs";
import { isCloudRunTerminal, createCloudTimelineProjection } from "@voidmix/agent-ui/model";
import { env } from "../../env";
import { captureProductEvent } from "../../lib/product-telemetry";
import { useCloudQueries } from "../../lib/use-cloud-queries";
import { invalidateRunFacts } from "../../lib/cloud-queries";
export interface CloudRunControllerOptions {
  api: ApiClient;
  runId: string;
  onSnapshot?: (snapshot: CloudRunSnapshotDto) => void;
  onFinished?: () => void;
  onRetry?: (runId: string) => void;
}
export function useCloudRunController({
  api,
  runId,
  onSnapshot,
  onFinished,
  onRetry,
}: CloudRunControllerOptions) {
  const { identity, resources, queryClient } = useCloudQueries();
  const [projectTimeline] = useState(() => createCloudTimelineProjection());
  const followed = useRef(resources.wasCreated(identity.accountId, runId));
  const [session] = useState(() =>
    createCloudRunSession({
      runId,
      transport: createCloudRunTransport(runId, {
        ...(env.VITE_API_URL ? { baseUrl: env.VITE_API_URL } : {}),
        fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
      }),
    }),
  );
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [guidance, setGuidance] = useState("");
  const [accepted, setAccepted] = useState<CloudCommandDto | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const ended = useRef(false);
  const delivered = useRef(false);
  const intents = useRef(new Map<string, string>());
  const steerIntent = useRef<{ text: string; key: string } | null>(null);
  useEffect(() => {
    if (snapshot.connection === "failed") resources.files.disposeAccount(identity.accountId);
  }, [snapshot.connection, resources, identity.accountId]);
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
  useEffect(() => {
    if (!snapshot.data) return;
    onSnapshot?.(snapshot.data);
    if (snapshot.data.artifacts.length && !delivered.current) {
      delivered.current = true;
      captureProductEvent("artifact_available", { artifactCount: snapshot.data.artifacts.length });
    }
    if (!isCloudRunTerminal(snapshot.data.run.status)) followed.current = true;
    if (
      snapshot.settled &&
      isCloudRunTerminal(snapshot.data.run.status) &&
      followed.current &&
      !ended.current
    ) {
      ended.current = true;
      resources.forgetCreated(identity.accountId, runId);
      void invalidateRunFacts(queryClient, identity, snapshot.data.run.taskId);
      onFinished?.();
    }
  }, [
    snapshot.data,
    snapshot.settled,
    onSnapshot,
    onFinished,
    resources,
    identity,
    queryClient,
    runId,
  ]);
  const capabilities = useMemo(
    () => ({
      loadToolDetail: async (callId: string) => {
        const signal = lifetime.current?.signal;
        const detail = await api.cloud.tools.get({ callId }, signal ? { signal } : {});
        return { input: detail.input, output: detail.output };
      },
    }),
    [api],
  );
  async function action(
    key: string,
    operation: (signal: AbortSignal, idempotencyKey: string) => Promise<unknown>,
  ) {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || locked.current) return;
    locked.current = true;
    setPending(key);
    setFailed(false);
    try {
      const idempotencyKey = intents.current.get(key) ?? crypto.randomUUID();
      intents.current.set(key, idempotencyKey);
      const result = await operation(signal, idempotencyKey);
      if (
        !signal.aborted &&
        result &&
        typeof result === "object" &&
        "type" in result &&
        "status" in result
      )
        setAccepted(result as CloudCommandDto);
      if (!signal.aborted) {
        intents.current.delete(key);
        session.refresh();
      }
    } catch {
      if (!signal.aborted) setFailed(true);
    } finally {
      locked.current = false;
      if (!signal.aborted) setPending(null);
    }
  }
  useEffect(() => {
    if (!snapshot.data?.commands.some((command) => command.status === "pending") && !accepted)
      return;
    const timer = setInterval(() => session.refresh(), 2500);
    return () => clearInterval(timer);
  }, [session, snapshot.data?.commands, accepted]);
  useEffect(() => {
    if (accepted && snapshot.data?.commands.some((command) => command.id === accepted.id))
      setAccepted(null);
  }, [accepted, snapshot.data?.commands]);
  const commandPending =
    Boolean(accepted?.status === "pending") ||
    Boolean(snapshot.data?.commands.some((command) => command.status === "pending"));
  const cancelPending =
    (accepted?.type === "cancel" && accepted.status === "pending") ||
    Boolean(
      snapshot.data?.commands.some(
        (command) => command.type === "cancel" && command.status === "pending",
      ),
    );
  async function cancel() {
    await action("cancel", (signal, idempotencyKey) =>
      api.cloud.runs.commands.create({ runId, type: "cancel", idempotencyKey }, { signal }),
    );
  }
  async function retry() {
    await action("retry", async (signal, idempotencyKey) => {
      const next = await api.cloud.runs.retry({ runId, idempotencyKey }, { signal });
      if (!signal.aborted) {
        resources.markCreated(identity.accountId, next.id);
        onRetry?.(next.id);
      }
    });
  }
  async function steer(text: string) {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || commandPending || locked.current) return;
    locked.current = true;
    setPending("steer");
    try {
      if (steerIntent.current?.text !== text)
        steerIntent.current = { text, key: crypto.randomUUID() };
      const command = await api.cloud.runs.commands.create(
        { runId, type: "steer", text, idempotencyKey: steerIntent.current.key },
        { signal },
      );
      if (!signal.aborted) {
        setAccepted(command);
        steerIntent.current = null;
        setGuidance("");
        session.refresh();
      }
    } finally {
      locked.current = false;
      if (!signal.aborted) setPending(null);
    }
  }
  const items = useMemo(
    () => (snapshot.data ? projectTimeline(snapshot.data) : []),
    [snapshot.data, projectTimeline],
  );
  return {
    snapshot,
    pending,
    commandPending,
    cancelPending,
    failed,
    guidance,
    setGuidance,
    capabilities,
    items,
    cancel,
    retry,
    steer,
    reconnect: session.reconnect,
    loadHistory: session.loadHistory,
  };
}
