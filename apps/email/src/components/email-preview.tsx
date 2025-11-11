import * as emails from "@raypx/email/emails";
import { Button } from "@raypx/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@raypx/ui/components/dialog";
import { Input } from "@raypx/ui/components/input";
import { Label } from "@raypx/ui/components/label";
import { render } from "@react-email/render";
import { useEffect, useState } from "react";

// Get all email templates
const templates = Object.entries(emails).filter(([name]) => name !== "EmailTemplateProps");

type SendHistory = {
  id: string;
  templateName: string;
  to: string;
  timestamp: Date;
  status: "sending" | "success" | "error";
  message?: string;
};

export function EmailPreview() {
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]?.[0] || "");
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");

  // Send test email state
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendHistory, setSendHistory] = useState<SendHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!selectedTemplate) return;

    const renderEmail = async () => {
      setLoading(true);
      try {
        const [name, Template] = templates.find(([n]) => n === selectedTemplate) || [];
        if (!Template) return;

        // Use PreviewProps if available
        const props = (Template as any).PreviewProps || {};
        const rendered = await render(<Template {...props} />);
        setHtml(rendered);
      } catch (error) {
        console.error("Failed to render email:", error);
        setHtml(`<div style="padding: 20px; color: red;">Error rendering email: ${error}</div>`);
      } finally {
        setLoading(false);
      }
    };

    renderEmail();
  }, [selectedTemplate]);

  const handleSendTestEmail = async () => {
    if (!testEmail || !selectedTemplate) return;

    const historyId = `${Date.now()}`;
    const newHistory: SendHistory = {
      id: historyId,
      templateName: selectedTemplate,
      to: testEmail,
      timestamp: new Date(),
      status: "sending",
    };

    setSendHistory((prev) => [newHistory, ...prev]);
    setSending(true);

    try {
      const response = await fetch("/api/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          templateName: selectedTemplate,
          to: testEmail,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to send email");
      }

      // Update history with success
      setSendHistory((prev) =>
        prev.map((h) =>
          h.id === historyId ? { ...h, status: "success" as const, message: result.message } : h,
        ),
      );

      setShowSendDialog(false);
      setTestEmail("");
    } catch (error) {
      console.error("Failed to send test email:", error);

      // Update history with error
      setSendHistory((prev) =>
        prev.map((h) =>
          h.id === historyId
            ? {
                ...h,
                status: "error" as const,
                message: error instanceof Error ? error.message : "Unknown error",
              }
            : h,
        ),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-[280px] border-r bg-gray-50 flex flex-col">
        <div className="p-5 border-b">
          <h1 className="text-lg font-semibold mb-1">Email Preview</h1>
          <p className="text-sm text-gray-600">{templates.length} templates</p>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {templates.map(([name]) => (
            <Button
              className={`
                w-full px-3 py-2.5 mb-1 rounded-md text-left text-sm font-medium
                transition-colors duration-150
                ${
                  selectedTemplate === name
                    ? "bg-blue-500 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }
              `}
              key={name}
              onClick={() => setSelectedTemplate(name)}
            >
              {name}
            </Button>
          ))}
        </nav>

        <div className="p-4 border-t text-xs text-gray-500">
          <p>⚡ TanStack Start</p>
          <p className="mt-1">Development Only</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="px-5 py-3 border-b flex items-center gap-4 bg-white">
          <h2 className="text-base font-medium flex-1">{selectedTemplate}</h2>

          {/* View Mode Toggle */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-md">
            <Button
              className={`
                px-3 py-1.5 rounded text-xs font-medium transition-colors
                ${viewMode === "desktop" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"}
              `}
              onClick={() => setViewMode("desktop")}
            >
              🖥️ Desktop
            </Button>
            <Button
              className={`
                px-3 py-1.5 rounded text-xs font-medium transition-colors
                ${viewMode === "mobile" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"}
              `}
              onClick={() => setViewMode("mobile")}
            >
              📱 Mobile
            </Button>
          </div>

          {/* Send Test Email Button */}
          <Button
            className="px-4 py-2 rounded-md text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            onClick={() => setShowSendDialog(true)}
          >
            📧 Send Test
          </Button>

          {/* History Button */}
          <Button
            className={`
              px-4 py-2 rounded-md text-sm font-medium border transition-colors
              ${showHistory ? "bg-gray-100 border-gray-300" : "bg-white border-gray-200 hover:bg-gray-50"}
            `}
            onClick={() => setShowHistory(!showHistory)}
          >
            📝 History {sendHistory.length > 0 && `(${sendHistory.length})`}
          </Button>
        </div>

        {/* Preview Area */}
        <div className="flex-1 bg-gray-100 flex items-center justify-center p-5 overflow-auto relative">
          {loading ? (
            <div className="text-center text-gray-600">
              <div className="text-3xl mb-2">⏳</div>
              <div>Rendering email...</div>
            </div>
          ) : (
            <div
              className={`
                h-full bg-white rounded-lg shadow-md overflow-hidden
                ${viewMode === "mobile" ? "w-[375px]" : "w-full max-w-[900px]"}
              `}
            >
              <iframe className="w-full h-full border-none" srcDoc={html} title="Email Preview" />
            </div>
          )}

          {/* History Panel */}
          {showHistory && sendHistory.length > 0 && (
            <div className="absolute top-5 right-5 w-[350px] max-h-[calc(100%-40px)] bg-white rounded-lg shadow-xl flex flex-col">
              <div className="p-4 border-b flex items-center justify-between">
                <h3 className="text-sm font-semibold">Send History</h3>
                <Button
                  className="text-gray-500 hover:text-gray-700 text-lg"
                  onClick={() => setShowHistory(false)}
                  type="button"
                >
                  ×
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {sendHistory.map((item) => (
                  <div className="p-3 mb-2 border rounded-md text-sm" key={item.id}>
                    <div className="font-medium mb-1">{item.templateName}</div>
                    <div className="text-gray-600 text-xs">To: {item.to}</div>
                    <div className="mt-2 pt-2 border-t flex items-center justify-between">
                      <span
                        className={`
                          px-2 py-0.5 rounded text-xs font-medium
                          ${
                            item.status === "success"
                              ? "bg-green-100 text-green-700"
                              : item.status === "error"
                                ? "bg-red-100 text-red-700"
                                : "bg-yellow-100 text-yellow-700"
                          }
                        `}
                      >
                        {item.status === "success"
                          ? "✓ Sent"
                          : item.status === "error"
                            ? "✗ Failed"
                            : "⏳ Sending"}
                      </span>
                      <span className="text-xs text-gray-500">
                        {item.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    {item.message && (
                      <div className="mt-2 text-xs text-gray-600 italic">{item.message}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Send Test Email Dialog */}
      <Dialog
        onOpenChange={(open) => {
          setShowSendDialog(open);
          if (!open) setTestEmail("");
        }}
        open={showSendDialog}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>
              Send <span className="font-medium text-foreground">{selectedTemplate}</span> to a test
              email address.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="test-email">Recipient Email</Label>
              <Input
                autoFocus
                disabled={sending}
                id="test-email"
                onChange={(e) => setTestEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !sending && testEmail) {
                    handleSendTestEmail();
                  }
                }}
                placeholder="test@example.com"
                type="email"
                value={testEmail}
              />
            </div>

            {/* Info message */}
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs text-blue-700">
                💡 Configure{" "}
                <code className="rounded bg-blue-100 px-1.5 py-0.5">RESEND_API_KEY</code> or SMTP
                credentials to send real emails. Otherwise, emails will be logged to console.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={sending}
              onClick={() => {
                setShowSendDialog(false);
                setTestEmail("");
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={sending || !testEmail} onClick={handleSendTestEmail}>
              {sending ? "Sending..." : "Send Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
