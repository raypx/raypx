import { Button } from "@raypx/ui/components/button";
import { ToggleGroup, ToggleGroupItem } from "@raypx/ui/components/toggle-group";
import { cn } from "@raypx/ui/lib/utils";
import { Check, Code, Copy, Download, Eye, Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import { useRender } from "../hooks/use-render";
import { useSource } from "../hooks/use-source";
import type { EmailMenuItem } from "../lib/emails";
import { EmailPreview } from "./preview";
import { SendDialog } from "./send-dialog";

interface EditorProps {
  templateName: string;
  menuTree: EmailMenuItem[];
  from?: string;
  to?: string;
  subject?: string;
}

function findTemplateLabel(menuTree: EmailMenuItem[], templateName: string): string {
  function traverse(items: EmailMenuItem[]): string | null {
    for (const item of items) {
      if (item.templateName === templateName) {
        return item.label;
      }
      if (item.children) {
        const found = traverse(item.children);
        if (found) return found;
      }
    }
    return null;
  }

  return traverse(menuTree) || templateName;
}

type ViewMode = "preview" | "code";
type DeviceMode = "desktop" | "mobile";
type CodeTab = "react" | "html" | "plaintext";

export function Editor({ templateName, menuTree, from, to, subject }: EditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [deviceMode, setDeviceMode] = useState<DeviceMode>("desktop");
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [codeTab, setCodeTab] = useState<CodeTab>("react");
  const [copied, setCopied] = useState(false);

  const templateLabel = findTemplateLabel(menuTree, templateName);
  const { html, loading } = useRender(templateName);
  const { source, loading: sourceLoading } = useSource(templateName);

  const reactCode = source || "";
  const plainText = htmlToPlainText(html || "");

  const handleCopy = async () => {
    const content = codeTab === "react" ? reactCode : codeTab === "html" ? html || "" : plainText;
    if (typeof navigator !== "undefined") {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const content = codeTab === "react" ? reactCode : codeTab === "html" ? html || "" : plainText;
    const ext = codeTab === "react" ? "tsx" : codeTab === "html" ? "html" : "txt";
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${templateName}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const displayHtml = html || "";
  const displaySource = source || "";

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Top Toolbar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        {/* Left: File info */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Code className="h-4 w-4" />
          <span>{templateLabel}</span>
        </div>

        {/* Center: View mode toggle */}
        <ToggleGroup
          className="border border-border rounded-lg bg-muted/50"
          onValueChange={(value) => {
            if (value) setViewMode(value as ViewMode);
          }}
          type="single"
          value={viewMode}
          variant="default"
        >
          <ToggleGroupItem
            aria-label="Preview view"
            className="data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            value="preview"
          >
            <Eye className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem
            aria-label="Code view"
            className="data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            value="code"
          >
            <Code className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>

        {/* Right: Device toggle & Send */}
        <div className="flex items-center gap-2">
          <ToggleGroup
            className="border border-border rounded-lg"
            onValueChange={(value) => {
              if (value) setDeviceMode(value as DeviceMode);
            }}
            type="single"
            value={deviceMode}
            variant="default"
          >
            <ToggleGroupItem aria-label="Desktop view" value="desktop">
              <Monitor className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem aria-label="Mobile view" value="mobile">
              <Smartphone className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            className="gap-2 bg-transparent"
            onClick={() => setSendDialogOpen(true)}
            variant="outline"
          >
            Send
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 overflow-hidden bg-muted/30">
        {viewMode === "preview" ? (
          <PreviewPane
            deviceMode={deviceMode}
            from={from}
            html={displayHtml}
            loading={loading}
            subject={subject}
            to={to}
          />
        ) : (
          <CodePane
            codeTab={codeTab}
            copied={copied}
            html={displayHtml}
            loading={sourceLoading}
            onCodeTabChange={setCodeTab}
            onCopy={handleCopy}
            onDownload={handleDownload}
            plainText={plainText}
            reactCode={displaySource}
          />
        )}
      </main>

      {/* Send Email Dialog */}
      <SendDialog
        html={displayHtml}
        onOpenChange={setSendDialogOpen}
        open={sendDialogOpen}
        templateName={templateName}
      />
    </div>
  );
}

function PreviewPane({
  html,
  deviceMode,
  loading,
  from,
  to,
  subject,
}: {
  html: string;
  deviceMode: DeviceMode;
  loading: boolean;
  from?: string;
  to?: string;
  subject?: string;
}) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <div className="text-3xl mb-2 animate-pulse">⏳</div>
          <div>Rendering email...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full p-8 min-h-0">
      <div
        className={cn(
          "rounded-lg bg-card transition-all duration-300 overflow-hidden flex flex-col h-full w-full min-h-0",
          deviceMode === "desktop" ? "max-w-4xl mx-auto" : "w-[375px] mx-auto",
        )}
      >
        <div className="flex-1 min-h-0 overflow-hidden">
          <EmailPreview
            from={from || "hello@raypx.com"}
            height={deviceMode === "desktop" ? 600 : 667}
            html={html}
            loading={false}
            subject={subject || "Email Preview"}
            to={to || "preview@example.com"}
            viewMode={deviceMode}
            width={deviceMode === "desktop" ? 800 : 375}
          />
        </div>
      </div>
    </div>
  );
}

interface CodePaneProps {
  html: string;
  reactCode: string;
  plainText: string;
  codeTab: CodeTab;
  onCodeTabChange: (tab: CodeTab) => void;
  onCopy: () => void;
  onDownload: () => void;
  copied: boolean;
  loading: boolean;
}

function CodePane({
  html,
  reactCode,
  plainText,
  codeTab,
  onCodeTabChange,
  onCopy,
  onDownload,
  copied,
  loading,
}: CodePaneProps) {
  const content = codeTab === "react" ? reactCode : codeTab === "html" ? html : plainText;
  const lines = content.split("\n");

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <div className="text-3xl mb-2 animate-pulse">⏳</div>
          <div>Loading source...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full p-8 min-h-0">
      <div className="w-full max-w-4xl h-full rounded-lg border border-border bg-card overflow-hidden flex flex-col min-h-0 mx-auto">
        {/* Code tabs header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 shrink-0">
          <div className="flex">
            <button
              className={cn(
                "px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                codeTab === "react"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onCodeTabChange("react")}
              type="button"
            >
              React
            </button>
            <button
              className={cn(
                "px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                codeTab === "html"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onCodeTabChange("html")}
              type="button"
            >
              HTML
            </button>
            <button
              className={cn(
                "px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                codeTab === "plaintext"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onCodeTabChange("plaintext")}
              type="button"
            >
              Plain Text
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={onDownload}
              title="Download"
              type="button"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={onCopy}
              title="Copy"
              type="button"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Code content with line numbers */}
        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((line, index) => (
                <tr className="hover:bg-muted/30" key={index}>
                  <td className="w-12 px-4 py-0 text-right text-xs text-muted-foreground select-none border-r border-border bg-muted/20 align-top">
                    <span className="leading-6">{index + 1}</span>
                  </td>
                  <td className="px-4 py-0 font-mono text-sm">
                    <pre className="leading-6 whitespace-pre-wrap text-foreground/90">
                      {line || " "}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function htmlToPlainText(html: string): string {
  // Remove style and script tags and their content
  let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

  // Replace <br> and block elements with newlines
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|h[1-6]|tr|li)>/gi, "\n");
  text = text.replace(/<(p|div|h[1-6]|tr|li)[^>]*>/gi, "\n");

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#039;/g, "'");

  // Clean up whitespace
  text = text.replace(/\n\s*\n/g, "\n\n");
  text = text.trim();

  return text;
}
