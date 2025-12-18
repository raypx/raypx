import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types";

export function useChatMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addUserMessage = (content: string): ChatMessage => {
    const userMessage: ChatMessage = {
      role: "user",
      content: content.trim(),
    };

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

    return userMessage;
  };

  const clearMessages = () => {
    setMessages([]);
  };

  const loadMessages = (loadedMessages: ChatMessage[]) => {
    if (messages.length === 0 && loadedMessages.length > 0) {
      setMessages(loadedMessages);
    }
  };

  return {
    messages,
    setMessages,
    messagesEndRef,
    addUserMessage,
    clearMessages,
    loadMessages,
  };
}
