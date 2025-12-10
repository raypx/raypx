import { useAuth } from "@raypx/auth";
import { useTRPC } from "@raypx/trpc/client";
import { Avatar, AvatarFallback, AvatarImage } from "@raypx/ui/components/avatar";
import { Button } from "@raypx/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import { Input } from "@raypx/ui/components/input";
import { ScrollArea } from "@raypx/ui/components/scroll-area";
import { toast } from "@raypx/ui/components/toast";
import { cn } from "@raypx/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bot, Loader2, MessageSquare, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "~/components/empty-state";
import { ErrorState } from "~/components/error-state";
import { MarkdownContent } from "~/components/markdown-content";
import { PageWrapper } from "~/components/page-wrapper";
import { truncateTextMiddle } from "~/lib/dashboard-utils";

function getUserInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const names = name.trim().split(" ");
    if (names.length >= 2) {
      const firstInitial = names[0]?.[0];
      const lastInitial = names[names.length - 1]?.[0];
      if (firstInitial && lastInitial) {
        return `${firstInitial}${lastInitial}`.toUpperCase();
      }
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return "U";
}

export const Route = createFileRoute("/dashboard/datasets/$id/chat")({
  component: DatasetChatPage,
});

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  sources?: Array<{
    chunkId: string;
    text: string;
    similarity: number;
    documentId: string;
    documentName: string;
    chunkIndex: number;
    metadata?: Record<string, unknown>;
  }>;
}

function DatasetChatPage() {
  const { id: datasetId } = Route.useParams();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const {
    hooks: { useSession },
  } = useAuth();
  const { data: session } = useSession();
  const user = session?.user;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch dataset info
  const datasetQuery = useQuery({
    ...trpc.datasets.byId.queryOptions({ id: datasetId }),
    enabled: !!datasetId,
  });

  const dataset = datasetQuery.data;
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Query for existing conversations
  const conversationsQuery = useQuery({
    ...trpc.conversations.list.queryOptions({
      datasetId,
      limit: 1,
    }),
    enabled: !!dataset && !conversationId,
  });

  // Mutation to create conversation
  const createConversationMutation = useMutation({
    ...trpc.conversations.create.mutationOptions(),
  });

  // Mutation to clear conversation messages
  const clearMessagesMutation = useMutation({
    ...trpc.conversations.clearMessages.mutationOptions(),
    onSuccess: () => {
      setMessages([]);
      toast.success("Chat history cleared");
      // Refetch messages to ensure UI is in sync
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

  // Track if we're already creating a conversation to prevent duplicate calls
  const isCreatingRef = useRef(false);

  // Initialize conversation when dataset is loaded
  useEffect(() => {
    if (!dataset || conversationId || isCreatingRef.current) return;

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
          datasetId,
          title: dataset.name,
        },
        {
          onSuccess: (result) => {
            setConversationId(result.id);
            isCreatingRef.current = false;
          },
          onError: (error) => {
            console.error("Failed to create conversation:", error);
            isCreatingRef.current = false;
            // Continue without conversation history if it fails
          },
        },
      );
    }
  }, [
    dataset,
    conversationId,
    conversationsQuery.data,
    conversationsQuery.isSuccess,
    createConversationMutation.isPending,
    datasetId,
  ]);

  // Load messages when conversation is found
  useEffect(() => {
    if (messagesQuery.data && messagesQuery.data.length > 0 && messages.length === 0) {
      setMessages(
        messagesQuery.data.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
          thinking: msg.thinking || undefined,
          sources: msg.sources as ChatMessage["sources"],
        })),
      );
    }
  }, [messagesQuery.data, messages.length]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: input.trim(),
    };

    // Clear input immediately
    setInput("");

    // Prepare messages for API (include all previous messages)
    const apiMessages = [...messages, userMessage].map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Calculate assistant message ID before adding messages
    // After adding user message, assistant will be at messages.length + 1
    const assistantMessageId = messages.length + 1;

    // Store the original message count before adding new messages
    // This allows us to rollback both user and assistant messages on error
    const originalMessageCount = messages.length;

    // Add both user and assistant messages in one update
    setMessages((prev) => [
      ...prev,
      userMessage,
      {
        role: "assistant",
        content: "",
        thinking: undefined,
        sources: undefined,
      },
    ]);

    setIsStreaming(true);

    // Abort any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      // Call SSE endpoint
      const response = await fetch("/api/rag/chat-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: apiMessages,
          datasetId,
          maxChunks: 5,
          similarityThreshold: 0.1,
          temperature: 0.7,
          maxTokens: 2000,
          llmProvider: "aliyun",
          llmModel: "qwen3-max",
          conversationId: conversationId || undefined,
          saveHistory: !!conversationId,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}. ${errorText}`);
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent: string | null = null;
      let currentData: string | null = null;
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          // Handle event type
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
            continue;
          }

          // Handle data line
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            // Accumulate data (may be split across multiple lines)
            if (currentData === null) {
              currentData = data;
            } else {
              currentData += "\n" + data;
            }
            continue;
          }

          // Empty line indicates end of event block
          if (line === "") {
            // Process the event if we have both event type and data
            if (currentEvent && currentData !== null) {
              try {
                const data = currentData.trim();
                if (!data) {
                  // Reset and continue
                  currentEvent = null;
                  currentData = null;
                  continue;
                }

                const parsed = JSON.parse(data);

                // Handle different event types
                if (currentEvent === "chunk" && parsed.content !== undefined) {
                  // Update assistant message content incrementally
                  setMessages((prev) => {
                    const updated = [...prev];
                    const assistantMsg = updated[assistantMessageId];
                    if (assistantMsg && assistantMsg.role === "assistant") {
                      updated[assistantMessageId] = {
                        ...assistantMsg,
                        content: assistantMsg.content + parsed.content,
                      };
                    }
                    return updated;
                  });
                } else if (currentEvent === "thinking" && parsed.content !== undefined) {
                  // Update thinking content
                  setMessages((prev) => {
                    const updated = [...prev];
                    const assistantMsg = updated[assistantMessageId];
                    if (assistantMsg && assistantMsg.role === "assistant") {
                      updated[assistantMessageId] = {
                        ...assistantMsg,
                        thinking: (assistantMsg.thinking || "") + parsed.content,
                      };
                    }
                    return updated;
                  });
                } else if (currentEvent === "sources" && parsed.sources) {
                  // Update sources
                  setMessages((prev) => {
                    const updated = [...prev];
                    const assistantMsg = updated[assistantMessageId];
                    if (assistantMsg && assistantMsg.role === "assistant") {
                      updated[assistantMessageId] = {
                        ...assistantMsg,
                        sources: parsed.sources,
                      };
                    }
                    return updated;
                  });
                } else if (currentEvent === "error") {
                  throw new Error(parsed.message || "Streaming error occurred");
                } else if (currentEvent === "done") {
                  // Stream completed
                  streamDone = true;
                  break;
                }
              } catch (e) {
                // Log parsing errors - use toast for user-visible errors
                const errorMessage = e instanceof Error ? e.message : String(e);
                toast.error(`Failed to parse stream data: ${errorMessage}`);
              }
            }

            // Reset for next event
            currentEvent = null;
            currentData = null;

            // Break out of for loop if stream is done
            if (streamDone) {
              break;
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // Request was aborted, remove both user and assistant messages
        setMessages((prev) => prev.slice(0, originalMessageCount));
        return;
      }

      toast.error(error instanceof Error ? error.message : "Failed to generate response");
      // Remove both user and assistant messages on error
      setMessages((prev) => prev.slice(0, originalMessageCount));
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  if (datasetQuery.isPending) {
    return (
      <PageWrapper spacing="lg">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">Loading...</div>
          </CardContent>
        </Card>
      </PageWrapper>
    );
  }

  if (datasetQuery.isError || !dataset) {
    return (
      <PageWrapper spacing="lg">
        <ErrorState
          message={datasetQuery.error?.message ?? "Dataset not found"}
          onRetry={() => {
            navigate({ to: "/dashboard/datasets" });
          }}
          retrying={datasetQuery.isFetching}
        />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper spacing="lg">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => navigate({ to: `/dashboard/datasets/${datasetId}/document` })}
              size="icon"
              variant="ghost"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold truncate">
                {truncateTextMiddle(dataset.name, 60)}
              </h1>
              <p className="text-sm text-muted-foreground">Chat with dataset</p>
            </div>
          </div>
        </div>

        {/* Chat Interface */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50 flex flex-col h-[calc(100vh-16.5rem)]">
          <CardHeader className="shrink-0 border-b border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Chat
                </CardTitle>
                <CardDescription>Ask questions about documents in this dataset</CardDescription>
              </div>
              {conversationId && messages.length > 0 && (
                <Button
                  disabled={clearMessagesMutation.isPending || isStreaming}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Are you sure you want to clear the chat history? This action cannot be undone.",
                      )
                    ) {
                      clearMessagesMutation.mutate({ conversationId });
                    }
                  }}
                  size="sm"
                  variant="outline"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {clearMessagesMutation.isPending ? "Clearing..." : "Clear History"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 min-h-0 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1 min-h-0 p-4" ref={scrollAreaRef}>
              <div className="space-y-4">
                {messages.length === 0 ? (
                  <EmptyState
                    description="Ask questions about the documents in this dataset"
                    icon={MessageSquare}
                    title="Start a conversation"
                  />
                ) : (
                  messages.map((message, index) => (
                    <div
                      className={cn(
                        "flex gap-4 min-w-0",
                        message.role === "user" ? "justify-end" : "justify-start",
                      )}
                      key={index}
                    >
                      {message.role === "assistant" && (
                        <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <div
                        className={cn(
                          "rounded-lg px-4 py-3 max-w-[80%] min-w-0",
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted",
                        )}
                      >
                        {message.role === "assistant" && message.thinking && (
                          <div className="mb-2 p-2 bg-muted-foreground/10 rounded text-sm text-muted-foreground italic break-words">
                            <div className="font-semibold mb-1">Thinking:</div>
                            <div className="whitespace-pre-wrap break-words">
                              {message.thinking}
                            </div>
                          </div>
                        )}
                        {message.role === "assistant" ? (
                          <MarkdownContent
                            className="text-foreground"
                            content={
                              message.content ||
                              (isStreaming && index === messages.length - 1 ? "Thinking..." : "")
                            }
                          />
                        ) : (
                          <div className="whitespace-pre-wrap wrap-break-word">
                            {message.content ||
                              (isStreaming && index === messages.length - 1 ? (
                                <span className="text-muted-foreground italic">Thinking...</span>
                              ) : null)}
                          </div>
                        )}
                        {message.sources && message.sources.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border/50">
                            <div className="text-xs font-semibold mb-2 text-muted-foreground">
                              Sources ({message.sources.length}):
                            </div>
                            <div className="space-y-1">
                              {(() => {
                                // Group sources by documentId or documentName
                                const groupedSources = message.sources.reduce(
                                  (acc, source) => {
                                    const key = source.documentId || source.documentName;
                                    if (!acc[key]) {
                                      acc[key] = [];
                                    }
                                    acc[key].push(source);
                                    return acc;
                                  },
                                  {} as Record<string, typeof message.sources>,
                                );

                                // Convert to array and sort by highest similarity
                                const groupedArray = Object.values(groupedSources)
                                  .map((sources) => {
                                    const firstSource = sources[0];
                                    if (!firstSource) return null;
                                    return {
                                      documentName: firstSource.documentName || "Unknown",
                                      documentId: firstSource.documentId || "",
                                      chunks: sources
                                        .map((s) => ({
                                          chunkIndex: s.chunkIndex ?? 0,
                                          similarity: s.similarity,
                                        }))
                                        .sort((a, b) => b.similarity - a.similarity),
                                      maxSimilarity: Math.max(...sources.map((s) => s.similarity)),
                                    };
                                  })
                                  .filter((g): g is NonNullable<typeof g> => g !== null)
                                  .sort((a, b) => b.maxSimilarity - a.maxSimilarity)
                                  .slice(0, 5);

                                return groupedArray.map((group, idx) => {
                                  const firstChunk = group.chunks[0];
                                  return (
                                    <div
                                      className="text-xs text-muted-foreground flex items-start gap-2"
                                      key={idx}
                                      title={`${group.documentName} - chunks: ${group.chunks.map((c) => c.chunkIndex + 1).join(", ")}`}
                                    >
                                      <span className="shrink-0">•</span>
                                      <span className="flex-1 min-w-0 break-words">
                                        <span className="font-medium">
                                          {truncateTextMiddle(group.documentName, 40)}
                                        </span>
                                        {group.chunks.length > 1 ? (
                                          <span className="ml-1 opacity-70">
                                            (chunks{" "}
                                            {group.chunks.map((c) => c.chunkIndex + 1).join(", ")})
                                          </span>
                                        ) : firstChunk ? (
                                          <span className="ml-1 opacity-70">
                                            (chunk {firstChunk.chunkIndex + 1})
                                          </span>
                                        ) : null}
                                      </span>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                      {message.role === "user" && (
                        <div className="shrink-0">
                          <Avatar className="h-8 w-8">
                            {user?.image && (
                              <AvatarImage alt={user?.name || user?.email || ""} src={user.image} />
                            )}
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {getUserInitials(user?.name, user?.email)}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                      )}
                    </div>
                  ))
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="border-t border-border/50 p-4 shrink-0">
              <div className="flex gap-2">
                <Input
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask a question about this dataset..."
                  value={input}
                />
                <Button disabled={!input.trim() || isStreaming} onClick={handleSend} size="icon">
                  {isStreaming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageWrapper>
  );
}
