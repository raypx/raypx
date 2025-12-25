import { Avatar, AvatarFallback, AvatarImage } from "@raypx/ui/components/avatar";
import { cn } from "@raypx/ui/lib/utils";
import { IconRobot } from "@tabler/icons-react";
import { MarkdownContent } from "~/components/markdown-content";
import type { ChatMessage } from "../types";
import { getUserInitials } from "../utils/user-utils";
import { ChatSources } from "./chat-sources";

interface ChatMessageComponentProps {
  message: ChatMessage;
  isStreaming?: boolean;
  isLastMessage?: boolean;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
}

export function ChatMessageComponent({
  message,
  isStreaming,
  isLastMessage,
  user,
}: ChatMessageComponentProps) {
  return (
    <div
      className={cn(
        "flex gap-3 min-w-0",
        message.role === "user" ? "justify-end" : "justify-start",
      )}
    >
      {message.role === "assistant" && (
        <div className="shrink-0">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <IconRobot className="h-4 w-4 text-primary" />
          </div>
        </div>
      )}

      <div
        className={cn(
          "max-w-[80%] min-w-0 rounded-lg px-4 py-2",
          message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {message.thinking && (
          <div className="mb-3 p-3 bg-muted/50 rounded border border-border/50 wrap-break-word">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Thinking Process:</p>
            <div className="text-xs text-muted-foreground whitespace-pre-wrap wrap-break-word font-mono">
              {message.thinking}
            </div>
          </div>
        )}
        {message.role === "assistant" ? (
          <MarkdownContent
            className="text-foreground"
            content={message.content || (isStreaming && isLastMessage ? "Thinking..." : "")}
          />
        ) : (
          <div className="whitespace-pre-wrap wrap-break-word">
            {message.content ||
              (isStreaming && isLastMessage ? (
                <span className="text-muted-foreground italic">Thinking...</span>
              ) : null)}
          </div>
        )}
        {message.sources && <ChatSources sources={message.sources} />}
      </div>

      {message.role === "user" && (
        <div className="shrink-0">
          <Avatar className="h-8 w-8">
            {user?.image && <AvatarImage alt={user?.name || user?.email || ""} src={user.image} />}
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {getUserInitials(user?.name, user?.email)}
            </AvatarFallback>
          </Avatar>
        </div>
      )}
    </div>
  );
}
