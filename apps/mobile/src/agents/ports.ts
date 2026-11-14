import { createApiClient, type ApiClient, type FetchCallable } from "@raypx/client/api";
import { conversationServerFrameSchema, MAX_CONVERSATION_FRAME_BYTES } from "@raypx/contracts/api";
import type {
  AgentsWorkspacePort,
  ConversationDraftStore,
  ConversationSocketPort,
} from "@raypx/agents/model";
import { sessionStoragePrefix } from "../config.js";

export interface DeviceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** SecureStore has a restricted key alphabet; tuple encoding remains collision-free. */
export function deviceDrafts(storage: DeviceStorage): ConversationDraftStore {
  function key(value: string) {
    return `draft.${sessionStoragePrefix(value)}`;
  }
  return {
    read: (value) => storage.getItem(key(value)),
    write: (value, text) => storage.setItem(key(value), text),
    // SecureStore has synchronous read/write but only asynchronous deletion. Emptying
    // synchronously preserves the model's persist-before-send ordering without races.
    remove: (value) => storage.setItem(key(value), ""),
  };
}

interface SessionPort {
  origin: string;
  cookie(): Promise<string>;
  expired(): void;
}

export function mobileApi(options: SessionPort & { fetch?: FetchCallable }): ApiClient {
  return createApiClient({
    baseUrl: options.origin,
    headers: async () => ({ Origin: options.origin, Cookie: await options.cookie() }),
    fetch: async (input, init) => {
      const response = await (options.fetch ?? globalThis.fetch)(input, init);
      if (response.status === 401) options.expired();
      return response;
    },
  });
}

function approvalError(error: unknown): never {
  // The model consumes stable domain reasons; transport prose is never displayed.
  if (error && typeof error === "object" && "data" in error) {
    const data = error.data;
    if (data && typeof data === "object" && "error" in data) {
      const detail = data.error;
      if (
        detail &&
        typeof detail === "object" &&
        "code" in detail &&
        typeof detail.code === "string"
      )
        throw new Error(detail.code);
    }
  }
  throw error;
}

export function mobileWorkspacePort(client: ApiClient): AgentsWorkspacePort {
  return {
    spaces: client.spaces,
    agents: client.agents,
    conversations: client.conversations,
    computers: client.computers,
    groups: client.conversations,
    spaceManagement: client.spaces,
    accountApprovalSettings: client.approvals,
    routines: client.routines,
    spaceMemory: client.spaceMemory,
    skills: client.skills,
    mcpServers: client.mcpServers,
    approvals: {
      effectiveMode: client.approvals.effectiveMode,
      pending: client.approvals.pending,
      effects: client.approvals.effects,
      async answer(input) {
        try {
          return await client.approvals.answer(input);
        } catch (error) {
          return approvalError(error);
        }
      },
    },
  };
}

export interface NativeEventSocket {
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(
    type: "close",
    listener: (event: { code: number; reason?: string }) => void,
  ): void;
  addEventListener(type: "error", listener: () => void): void;
  send(text: string): void;
  close(code?: number): void;
}

/** The native WebSocket accepts headers; cookies never enter a URL or JS persistence. */
export function mobileConversationSocket(
  options: SessionPort & {
    open(url: string, headers: Record<string, string>): NativeEventSocket;
    forbidden(reason?: string): void;
  },
): ConversationSocketPort {
  return {
    connect(callbacks) {
      let closed = false;
      let socket: NativeEventSocket | undefined;
      const url = new URL("/events", options.origin);
      url.protocol = "wss:";
      void options.cookie().then(
        (cookie) => {
          if (closed) return;
          if (!cookie) {
            options.expired();
            callbacks.onClose(4001);
            return;
          }
          try {
            socket = options.open(url.toString(), { Cookie: cookie, Origin: options.origin });
            socket.addEventListener("message", (event) => {
              if (closed) return;
              try {
                if (
                  typeof event.data !== "string" ||
                  new TextEncoder().encode(event.data).byteLength > MAX_CONVERSATION_FRAME_BYTES
                )
                  throw new Error("Invalid conversation frame");
                const frame = conversationServerFrameSchema.parse(JSON.parse(event.data));
                callbacks.onFrame(frame);
              } catch {
                closed = true;
                socket?.close(4000);
                callbacks.onError();
              }
            });
            socket.addEventListener("close", (event) => {
              if (closed) return;
              closed = true;
              if (event.code === 4001) options.expired();
              if (event.code === 4003) options.forbidden(event.reason);
              callbacks.onClose(event.code, event.reason);
            });
            socket.addEventListener("error", () => {
              if (!closed) callbacks.onError();
            });
          } catch {
            if (!closed) callbacks.onError();
          }
        },
        () => {
          if (!closed) callbacks.onError();
        },
      );
      return {
        send(frame) {
          if (closed || !socket) throw new Error("Socket is not open");
          socket.send(JSON.stringify(frame));
        },
        close() {
          closed = true;
          socket?.close();
        },
      };
    },
  };
}

/** A delivery identity, never an authentication secret. Frozen by the model before sending. */
export function messageKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
