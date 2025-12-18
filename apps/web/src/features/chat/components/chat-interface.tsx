import { Button } from "@raypx/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import { MessageSquare, Trash2 } from "lucide-react";
import { useState } from "react";
import { useChatConversation } from "../hooks/use-chat-conversation";
import { useChatMessages } from "../hooks/use-chat-messages";
import { useChatStream } from "../hooks/use-chat-stream";
import type { ChatContextType, ChatStreamParams } from "../types";
import { ChatInput } from "./chat-input";
import { ChatMessageList } from "./chat-message-list";

interface ChatInterfaceProps {
  contextType: ChatContextType;
  contextId: string;
  contextName: string;
  enabled: boolean;
  title?: string;
  description?: string;
  placeholder?: string;
  emptyStateMessage?: string;
  buildStreamParams: (params: {
    messages: Array<{ role: string; content: string }>;
    conversationId?: string;
  }) => ChatStreamParams;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
}

export function ChatInterface({
  contextType,
  contextId,
  contextName,
  enabled,
  title = "Chat",
  description = "Ask questions and get AI-powered answers",
  placeholder = "Ask a question...",
  emptyStateMessage = "Start a conversation by asking a question.",
  buildStreamParams,
  user,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");

  const { messages, setMessages, messagesEndRef, addUserMessage, loadMessages } = useChatMessages();

  const { conversationId, clearMessagesMutation } = useChatConversation({
    contextType,
    contextId,
    contextName,
    enabled,
    onMessagesLoaded: loadMessages,
  });

  const { isStreaming, streamChat } = useChatStream();

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage = addUserMessage(input);
    setInput("");

    const apiMessages = [...messages, userMessage].map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const streamParams = buildStreamParams({
      messages: apiMessages,
      conversationId: conversationId || undefined,
    });

    await streamChat(streamParams, messages, setMessages);
  };

  const handleClearHistory = () => {
    if (
      conversationId &&
      window.confirm(
        "Are you sure you want to clear the chat history? This action cannot be undone.",
      )
    ) {
      clearMessagesMutation.mutate({ conversationId });
      setMessages([]);
    }
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50 flex flex-col h-[calc(100vh-16.5rem)]">
      <CardHeader className="shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {conversationId && messages.length > 0 && (
            <Button
              disabled={clearMessagesMutation.isPending || isStreaming}
              onClick={handleClearHistory}
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
        <ChatMessageList
          emptyStateMessage={emptyStateMessage}
          isStreaming={isStreaming}
          messages={messages}
          messagesEndRef={messagesEndRef}
          user={user}
        />
        <ChatInput
          input={input}
          isStreaming={isStreaming}
          onInputChange={setInput}
          onSend={handleSend}
          placeholder={placeholder}
        />
      </CardContent>
    </Card>
  );
}
