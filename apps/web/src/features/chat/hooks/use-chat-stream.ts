import { toast } from "@raypx/ui/components/toast";
import { useRef, useState } from "react";
import type { ChatMessage, ChatStreamParams } from "../types";
import { parseSSEStream } from "../utils/sse-parser";

interface UseChatStreamOptions {
  onStreamStart?: () => void;
  onStreamEnd?: () => void;
  onError?: (error: Error) => void;
}

export function useChatStream(options: UseChatStreamOptions = {}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const streamChat = async (
    params: ChatStreamParams,
    messages: ChatMessage[],
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  ) => {
    const assistantMessageId = messages.length + 1;
    const originalMessageCount = messages.length;

    setIsStreaming(true);
    options.onStreamStart?.();

    // Abort any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/rag/chat-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}. ${errorText}`);
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      const reader = response.body.getReader();

      await parseSSEStream(reader, {
        onChunk: (content: string) => {
          setMessages((prev) => {
            const updated = [...prev];
            const assistantMsg = updated[assistantMessageId];
            if (assistantMsg && assistantMsg.role === "assistant") {
              updated[assistantMessageId] = {
                ...assistantMsg,
                content: assistantMsg.content + content,
              };
            }
            return updated;
          });
        },
        onThinking: (content: string) => {
          setMessages((prev) => {
            const updated = [...prev];
            const assistantMsg = updated[assistantMessageId];
            if (assistantMsg && assistantMsg.role === "assistant") {
              updated[assistantMessageId] = {
                ...assistantMsg,
                thinking: (assistantMsg.thinking || "") + content,
              };
            }
            return updated;
          });
        },
        onSources: (sources: unknown) => {
          setMessages((prev) => {
            const updated = [...prev];
            const assistantMsg = updated[assistantMessageId];
            if (assistantMsg && assistantMsg.role === "assistant") {
              updated[assistantMessageId] = {
                ...assistantMsg,
                sources: sources as ChatMessage["sources"],
              };
            }
            return updated;
          });
        },
        onError: (message: string) => {
          throw new Error(message);
        },
        onDone: () => {
          // Stream completed successfully
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setMessages((prev) => prev.slice(0, originalMessageCount));
        return;
      }

      const errorMessage = error instanceof Error ? error.message : "Failed to generate response";
      toast.error(errorMessage);
      options.onError?.(error instanceof Error ? error : new Error(errorMessage));
      setMessages((prev) => prev.slice(0, originalMessageCount));
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
      options.onStreamEnd?.();
    }
  };

  const abortStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return {
    isStreaming,
    streamChat,
    abortStream,
  };
}
