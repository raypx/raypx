import { Button } from "@raypx/ui/components/button";
import { Input } from "@raypx/ui/components/input";
import { Loader2, Send } from "lucide-react";

interface ChatInputProps {
  input: string;
  isStreaming: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
}

export function ChatInput({
  input,
  isStreaming,
  onInputChange,
  onSend,
  placeholder = "Ask a question...",
}: ChatInputProps) {
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="border-t border-border/50 p-4 shrink-0">
      <div className="flex gap-2">
        <Input
          className="flex-1"
          disabled={isStreaming}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          value={input}
        />
        <Button disabled={!input.trim() || isStreaming} onClick={onSend} size="icon">
          {isStreaming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
