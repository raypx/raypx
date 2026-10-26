import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { TaskComposerDraft } from "@raypx/tasks/client/task-composer";
import { safeReturnTo } from "../auth/return-to";

const parameter = "guestDraft";
const storageKey = (namespace: string, accountId?: string) =>
  JSON.stringify(["raypx.guest-task.v1", namespace, ...(accountId ? [accountId] : [])]);
const empty = { ready: true, failed: false, draft: undefined as TaskComposerDraft | undefined };
const server = { ...empty, ready: false };
const failed = { ...empty, failed: true };

/** The URL carries only a nonce; task text stays in this tab's session storage. */
export function saveGuestDraft(namespace: string, input: TaskComposerDraft, href: string) {
  const id = writeGuestDraft(namespace, input, href);
  const url = new URL(safeReturnTo(href), "https://return.invalid");
  url.searchParams.set(parameter, id);
  const returnTo = safeReturnTo(url.pathname + url.search + url.hash);
  if (!returnTo.startsWith("/tasks")) throw new Error("Invalid draft destination");
  return returnTo;
}

/** Temporary editor state is scoped to this server and tab, then claimed by a successful login. */
export function writeGuestDraft(namespace: string, input: TaskComposerDraft, href: string): string {
  const raw = sessionStorage.getItem(storageKey(namespace));
  let previous: { id?: string; accountId?: string } = {};
  try {
    if (raw && raw.length <= 200_000) previous = JSON.parse(raw);
  } catch {
    /* Editing replaces malformed temporary state. */
  }
  const id =
    !previous?.accountId && typeof previous?.id === "string" && /^[a-f0-9-]{36}$/.test(previous.id)
      ? previous.id
      : crypto.randomUUID();
  if (!input.prompt.trim()) {
    if (!previous?.accountId) sessionStorage.removeItem(storageKey(namespace));
    return id;
  }
  const url = new URL(safeReturnTo(href), "https://return.invalid");
  url.searchParams.delete(parameter);
  sessionStorage.setItem(
    storageKey(namespace),
    JSON.stringify({
      id,
      sourcePath: url.pathname + url.search + url.hash,
      createdAt: Date.now(),
      prompt: input.prompt,
      provider: input.provider,
      mode: input.mode,
    }),
  );
  return id;
}

export function claimGuestDraft(namespace: string, accountId: string) {
  const raw = sessionStorage.getItem(storageKey(namespace));
  if (!raw || raw.length > 200_000) return;
  const data = JSON.parse(raw);
  if (data.accountId) return;
  readGuestDraft(raw, data.id);
  sessionStorage.setItem(storageKey(namespace, accountId), JSON.stringify({ ...data, accountId }));
  sessionStorage.removeItem(storageKey(namespace));
}

/** Used at the click boundary, so sidebar login also preserves the current editor. */
export function guestReturnTo(namespace: string, href: string) {
  const target = safeReturnTo(href);
  const url = new URL(target, "https://return.invalid");
  if (url.pathname !== "/tasks") return target;
  try {
    const raw = sessionStorage.getItem(storageKey(namespace));
    if (raw && raw.length <= 200_000) {
      const data = JSON.parse(raw);
      readGuestDraft(raw, data.id);
      if (!data.accountId) url.searchParams.set(parameter, data.id);
    }
  } catch {
    /* The composer reports storage failures while preserving its text. */
  }
  return safeReturnTo(url.pathname + url.search + url.hash);
}

export function readGuestDraft(
  raw: string | null,
  id: string,
  now = Date.now(),
): TaskComposerDraft {
  if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id) || !raw || raw.length > 200_000)
    throw new Error("Draft unavailable");
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") throw new Error("Invalid draft");
  const data = value as Record<string, unknown>;
  if (
    data.id !== id ||
    typeof data.createdAt !== "number" ||
    !Number.isFinite(data.createdAt) ||
    now - data.createdAt > 86400_000 ||
    data.createdAt > now + 60_000 ||
    typeof data.prompt !== "string" ||
    !data.prompt.trim() ||
    data.prompt.length > 32_000 ||
    (data.provider !== "claude" && data.provider !== "codex") ||
    (data.mode !== "run" && data.mode !== "plan")
  )
    throw new Error("Invalid draft");
  return { prompt: data.prompt, provider: data.provider, mode: data.mode };
}

function draftStore(namespace: string, id: string | null, accountId: string | null) {
  let initialized = false;
  let snapshot = server;
  let consumed = false;
  let restoredId: string | undefined;
  let recordKey = storageKey(namespace, accountId ?? undefined);
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => {
      if (consumed) return empty;
      if (initialized) return snapshot;
      try {
        let raw = sessionStorage.getItem(recordKey);
        if (!raw && id && accountId) {
          recordKey = storageKey(namespace);
          raw = sessionStorage.getItem(recordKey);
        }
        initialized = true;
        snapshot = empty;
        if (!raw) {
          snapshot = id ? failed : empty;
          return snapshot;
        }
        if (raw.length > 200_000) throw new Error("Invalid draft");
        const data = JSON.parse(raw);
        if (data.accountId && data.accountId !== accountId) return empty;
        if (!id && accountId && data.accountId !== accountId) return empty;
        snapshot = { ready: true, failed: false, draft: readGuestDraft(raw, id ?? data.id) };
        restoredId = data.id;
        return snapshot;
      } catch {
        initialized = true;
        snapshot = failed;
        return snapshot;
      }
    },
    consume() {
      if (consumed) return;
      consumed = true;
      try {
        const raw = sessionStorage.getItem(recordKey);
        if (accountId && raw && raw.length <= 200_000 && JSON.parse(raw).id === restoredId)
          sessionStorage.removeItem(recordKey);
      } catch {
        /* The restored text remains in the editor. */
      }
      for (const listener of listeners) listener();
    },
  };
}

export function useGuestDraft(namespace: string, accountId: string | null = null) {
  const location = useLocation();
  const navigate = useNavigate();
  const id = new URLSearchParams(location.searchStr).get(parameter);
  const store = useMemo(() => draftStore(namespace, id, accountId), [namespace, id, accountId]);
  const state = useSyncExternalStore(store.subscribe, store.snapshot, () => server);
  const restored = useCallback(() => {
    store.consume();
    const url = new URL(location.href, "https://return.invalid");
    if (url.searchParams.has(parameter)) {
      url.searchParams.delete(parameter);
      void navigate({ to: url.pathname + url.search + url.hash, replace: true });
    }
  }, [store, navigate, location.href]);
  return { ...state, restored };
}
