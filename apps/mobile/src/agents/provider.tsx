import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter } from "expo-router";
import { Alert, AppState } from "react-native";
import { Spinner } from "heroui-native/spinner";
import * as SecureStore from "expo-secure-store";
import { apiOrigin, authClient } from "../auth.js";
import { sessionStoragePrefix } from "../config.js";
import { expireSession } from "../session-events.js";
import { useCopy } from "../locale.js";
import { Screen } from "../ui.js";
import {
  deviceDrafts,
  mobileApi,
  mobileConversationSocket,
  mobileWorkspacePort,
  type NativeEventSocket,
} from "./ports.js";
import { MobileWorkspace } from "./workspace.js";

const WorkspaceContext = createContext<MobileWorkspace | null>(null);
const secureDevice = {
  getItem: SecureStore.getItem,
  setItem(key: string, value: string) {
    SecureStore.setItem(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
};
type SocketConstructor = new (
  url: string,
  protocols: string[],
  options: { headers: Record<string, string> },
) => NativeEventSocket;

export function AgentsProvider({
  accountId,
  enabled,
  children,
}: {
  accountId: string | null;
  enabled: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<MobileWorkspace | null>(null);
  const { t } = useCopy();
  const announceSessionEnded = useEffectEvent(() => {
    Alert.alert(t("agents.spaceSettings.exitSessionEnded"));
  });
  const announceForbidden = useEffectEvent((reason?: string) => {
    const keys = {
      SPACE_MEMBER_REMOVED: "agents.spaceSettings.exitRemoved",
      SPACE_MEMBER_LEFT: "agents.spaceSettings.exitLeft",
      SPACE_DELETING: "agents.spaceSettings.exitDeleted",
    } as const;
    const key =
      reason && Object.hasOwn(keys, reason)
        ? keys[reason as keyof typeof keys]
        : "agents.spaceSettings.exitUnavailable";
    Alert.alert(t(key));
    router.replace("/");
  });
  useEffect(() => {
    let cancelled = false;
    let sessionAnnounced = false;
    let next: MobileWorkspace | undefined;
    const requests = new AbortController();
    function current() {
      return !cancelled;
    }
    // Effect-owned creation also survives StrictMode's setup/cleanup/setup cycle.
    queueMicrotask(() => {
      if (!current()) return;
      if (!accountId) {
        setWorkspace(null);
        return;
      }
      const session = {
        origin: apiOrigin,
        async cookie() {
          if (!current()) throw new Error("Session changed");
          const cookie = await authClient.getCookie();
          if (!current()) throw new Error("Session changed");
          return cookie;
        },
        expired() {
          if (current()) {
            if (!sessionAnnounced) announceSessionEnded();
            sessionAnnounced = true;
            expireSession();
          }
        },
      };
      const client = mobileApi({
        ...session,
        fetch: (input, init) => {
          if (!current()) return Promise.reject(new Error("Session changed"));
          return globalThis.fetch(input, { ...init, signal: requests.signal });
        },
      });
      const socket = mobileConversationSocket({
        ...session,
        open: (url, headers) => {
          if (!current()) throw new Error("Session changed");
          return new (WebSocket as unknown as SocketConstructor)(url, [], { headers });
        },
        forbidden: (reason) => {
          if (!current()) return;
          announceForbidden(reason);
          void next?.refresh();
        },
      });
      const preferenceKey = `space.${sessionStoragePrefix(JSON.stringify([apiOrigin, accountId]))}`;
      next = new MobileWorkspace(
        { origin: apiOrigin, accountId },
        mobileWorkspacePort(client),
        socket,
        deviceDrafts(secureDevice),
        {
          read: () => secureDevice.getItem(preferenceKey),
          write: (id) => secureDevice.setItem(preferenceKey, id),
        },
      );
      setWorkspace(next);
    });
    return () => {
      cancelled = true;
      requests.abort();
      next?.dispose();
    };
  }, [accountId]);
  useEffect(() => {
    workspace?.setActive(enabled && AppState.currentState === "active");
  }, [workspace, enabled]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      workspace?.setActive(enabled && state === "active");
    });
    return () => subscription.remove();
  }, [workspace, enabled]);
  const selected = workspace?.owner.accountId === accountId ? workspace : null;
  return (
    <WorkspaceContext value={selected}>
      {enabled && accountId && !selected ? (
        <Screen>
          <Spinner accessibilityLabel={t("common.loading")} className="self-center" />
        </Screen>
      ) : (
        children
      )}
    </WorkspaceContext>
  );
}

export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("A verified session is required");
  return workspace;
}
export function useWorkspaceView() {
  const workspace = useWorkspace();
  return useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);
}
