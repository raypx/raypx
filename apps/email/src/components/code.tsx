import { Button } from "@raypx/ui/components/button";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { CodeHighlighter } from "./highlighter";

type CodeViewProps = {
  source: string;
  sourceLoading: boolean;
};

export function CodeView({ source, sourceLoading }: CodeViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!source) return;
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  if (sourceLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <div className="text-3xl mb-2 animate-pulse">⏳</div>
          <div>Loading source code...</div>
        </div>
      </div>
    );
  }

  if (!source) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="p-4 text-center text-muted-foreground">
          Select a template to view source code
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-card rounded-xl shadow-lg overflow-hidden border border-border flex flex-col">
      {/* Code Header with Copy Button */}
      <div className="px-4 py-2 border-b border-border flex items-center justify-between bg-muted/50">
        <span className="text-xs font-medium text-muted-foreground">React</span>
        <Button className="h-7 px-3 text-xs" onClick={handleCopy} size="sm" variant="outline">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
      {/* Code Content */}
      <div className="flex-1 overflow-auto p-4">
        <CodeHighlighter code={source} language="tsx" />
      </div>
    </div>
  );
}
