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

export const Route = createFileRoute("/dashboard/documents/$id/chat")({
  component: DocumentChatPage,
});

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  thinking?: string; // Thinking/reasoning content from models
  sources?: Array<{
    chunkId: string;
    text: string;
    similarity: number;
    documentName: string;
  }>;
}

function DocumentChatPage() {
  const { id: documentId } = Route.useParams();
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

  // Fetch document info
  const documentQuery = useQuery({
    ...trpc.documents.byId.queryOptions({ id: documentId }),
    enabled: !!documentId,
  });

  const document = documentQuery.data;
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Query for existing conversations
  const conversationsQuery = useQuery({
    ...trpc.conversations.list.queryOptions({
      documentId,
      limit: 1,
    }),
    enabled: !!document && !conversationId,
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

  // Initialize conversation when document is loaded
  useEffect(() => {
    if (!document || conversationId || isCreatingRef.current) return;

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
          documentId,
          title: document.name,
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
    document,
    conversationId,
    conversationsQuery.data,
    conversationsQuery.isSuccess,
    createConversationMutation.isPending,
    documentId,
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
          documentId,
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
        // Request was aborted, remove the placeholder message
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      toast.error(error instanceof Error ? error.message : "Failed to generate response");
      // Remove the placeholder message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (documentQuery.isPending) {
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

  if (documentQuery.isError || !document) {
    return (
      <PageWrapper spacing="lg">
        <ErrorState
          message={documentQuery.error?.message ?? "Document not found"}
          onRetry={() => {
            navigate({ to: "/dashboard/datasets" });
          }}
          retrying={documentQuery.isFetching}
        />
      </PageWrapper>
    );
  }

  // Check if document is vectorized
  const isVectorized = document.status === "completed";

  return (
    <PageWrapper spacing="lg">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => navigate({ to: `/dashboard/datasets/${document.datasetId}/document` })}
              size="icon"
              variant="ghost"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold truncate" title={document.name}>
                {truncateTextMiddle(document.name, 60, 25, 25)}
              </h1>
              <p className="text-sm text-muted-foreground">Chat with this document using AI</p>
            </div>
          </div>
        </div>

        {/* Chat Card */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Document Chat
                </CardTitle>
                <CardDescription>
                  Ask questions about this document. The AI will search for relevant information and
                  provide answers.
                </CardDescription>
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
          <CardContent>
            {!isVectorized ? (
              <EmptyState
                actionLabel="Go to Documents"
                description="Please vectorize this document first before you can chat with it."
                icon={Bot}
                onAction={() =>
                  navigate({ to: `/dashboard/datasets/${document.datasetId}/document` })
                }
                title="Document not vectorized"
              />
            ) : (
              <div className="flex flex-col h-[600px]">
                {/* Messages Area */}
                <ScrollArea className="flex-1 pr-4" ref={scrollAreaRef}>
                  <div className="space-y-4">
                    {messages.length === 0 && (
                      <div className="text-center text-muted-foreground py-8">
                        <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Start a conversation by asking a question about the document.</p>
                      </div>
                    )}

                    {messages.map((message, index) => (
                      <div
                        className={cn(
                          "flex gap-3 min-w-0",
                          message.role === "user" ? "justify-end" : "justify-start",
                        )}
                        key={index}
                      >
                        {message.role === "assistant" && (
                          <div className="shrink-0">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <Bot className="h-4 w-4 text-primary" />
                            </div>
                          </div>
                        )}

                        <div
                          className={cn(
                            "max-w-[80%] min-w-0 rounded-lg px-4 py-2",
                            message.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted",
                          )}
                        >
                          {message.thinking && (
                            <div className="mb-3 p-3 bg-muted/50 rounded border border-border/50 wrap-break-word">
                              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                                Thinking Process:
                              </p>
                              <div className="text-xs text-muted-foreground whitespace-pre-wrap wrap-break-word font-mono">
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
                            <div className="mt-2 pt-2 border-t border-border/50">
                              <p className="text-xs text-muted-foreground mb-1">
                                Sources ({message.sources.length}):
                              </p>
                              <div className="space-y-1">
                                {message.sources.slice(0, 3).map((source, idx) => (
                                  <div
                                    className="text-xs text-muted-foreground truncate"
                                    key={idx}
                                    title={source.text}
                                  >
                                    • {truncateTextMiddle(source.documentName, 40, 15, 15)}{" "}
                                    (similarity: {(source.similarity * 100).toFixed(1)}%)
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {message.role === "user" && (
                          <div className="shrink-0">
                            <Avatar className="h-8 w-8">
                              {user?.image && (
                                <AvatarImage
                                  alt={user?.name || user?.email || ""}
                                  src={user.image}
                                />
                              )}
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {getUserInitials(user?.name, user?.email)}
                              </AvatarFallback>
                            </Avatar>
                          </div>
                        )}
                      </div>
                    ))}

                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Input Area */}
                <div className="mt-4 flex gap-2">
                  <Input
                    className="flex-1"
                    disabled={isStreaming}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask a question about this document..."
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
            )}
          </CardContent>
        </Card>
      </div>
    </PageWrapper>
  );
}
