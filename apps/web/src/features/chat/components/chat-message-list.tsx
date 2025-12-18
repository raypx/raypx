import { ScrollArea } from "@raypx/ui/components/scroll-area";
import { Bot } from "lucide-react";
import type { ChatMessage } from "../types";
import { ChatMessageComponent } from "./chat-message";

interface ChatMessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
  emptyStateMessage?: string;
}

export function ChatMessageList({
  messages,
  isStreaming,
  messagesEndRef,
  user,
  emptyStateMessage = "Start a conversation by asking a question.",
}: ChatMessageListProps) {
  return (
    <ScrollArea className="flex-1 min-h-0 pr-4">
      <div className="space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{emptyStateMessage}</p>
          </div>
        )}

        {messages.map((message, index) => (
          <ChatMessageComponent
            isLastMessage={index === messages.length - 1}
            isStreaming={isStreaming}
            key={index}
            message={message}
            user={user}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
}
