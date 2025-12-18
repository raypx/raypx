import { useTRPC } from "@raypx/trpc/client";
import { toast } from "@raypx/ui/components/toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { ChatContextType, ChatMessage } from "../types";

interface UseChatConversationOptions {
  contextType: ChatContextType;
  contextId: string;
  contextName: string;
  enabled: boolean;
  onMessagesLoaded?: (messages: ChatMessage[]) => void;
}

export function useChatConversation(options: UseChatConversationOptions) {
  const { contextType, contextId, contextName, enabled, onMessagesLoaded } = options;
  const trpc = useTRPC();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const isCreatingRef = useRef(false);

  // Query for existing conversations
  const conversationsQuery = useQuery({
    ...trpc.conversations.list.queryOptions({
      ...(contextType === "document" ? { documentId: contextId } : { datasetId: contextId }),
      limit: 1,
    }),
    enabled: enabled && !conversationId,
  });

  // Mutation to create conversation
  const createConversationMutation = useMutation({
    ...trpc.conversations.create.mutationOptions(),
  });

  // Mutation to clear conversation messages
  const clearMessagesMutation = useMutation({
    ...trpc.conversations.clearMessages.mutationOptions(),
    onSuccess: () => {
      toast.success("Chat history cleared");
      messagesQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to clear chat history");
    },
  });

  // Query for conversation messages
  const messagesQuery = useQuery({
    ...trpc.conversations.getMessages.queryOptions({
      conversationId: conversationsQuery.data?.[0]?.id || "",
    }),
    enabled: !!conversationsQuery.data?.[0]?.id && !conversationId,
  });

  // Initialize conversation when context is loaded
  useEffect(() => {
    if (!enabled || conversationId || isCreatingRef.current) return;

    // If we have an existing conversation, load its messages
    if (conversationsQuery.data && conversationsQuery.data.length > 0) {
      const conv = conversationsQuery.data[0];
      if (conv) {
        setConversationId(conv.id);
      }
    } else if (
      conversationsQuery.isSuccess &&
      conversationsQuery.data.length === 0 &&
      !createConversationMutation.isPending
    ) {
      // Create new conversation if none exists
      isCreatingRef.current = true;
      createConversationMutation.mutate(
        {
          ...(contextType === "document" ? { documentId: contextId } : { datasetId: contextId }),
          title: contextName,
        },
        {
          onSuccess: (result) => {
            setConversationId(result.id);
            isCreatingRef.current = false;
          },
          onError: (error) => {
            console.error("Failed to create conversation:", error);
            isCreatingRef.current = false;
          },
        },
      );
    }
  }, [
    enabled,
    conversationId,
    conversationsQuery.data,
    conversationsQuery.isSuccess,
    createConversationMutation.isPending,
    contextId,
    contextName,
    contextType,
  ]);

  // Load messages when conversation is found
  useEffect(() => {
    if (messagesQuery.data && messagesQuery.data.length > 0) {
      const loadedMessages = messagesQuery.data.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
        thinking: msg.thinking || undefined,
        sources: msg.sources as ChatMessage["sources"],
      }));
      onMessagesLoaded?.(loadedMessages);
    }
  }, [messagesQuery.data, onMessagesLoaded]);

  const clearMessages = () => {
    if (conversationId) {
      clearMessagesMutation.mutate({ conversationId });
    }
  };

  return {
    conversationId,
    conversationsQuery,
    messagesQuery,
    clearMessages,
    clearMessagesMutation,
  };
}
