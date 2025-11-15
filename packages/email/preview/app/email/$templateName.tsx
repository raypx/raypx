import { toast } from "@raypx/ui/components/toast";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { PreviewArea } from "../../components/preview-area";
import { SendDialog } from "../../components/send-dialog";
import { Toolbar } from "../../components/toolbar";
import { useLastEmail } from "../../components/use-last-email";
import { useRender } from "../../components/use-render";
import { useSend } from "../../components/use-send";
import { getTemplateNames } from "../../lib/emails";

export const Route = createFileRoute("/email/$templateName")({
  component: RouteComponent,
  beforeLoad: ({ params }) => {
    // Validate template name at route level
    const validTemplates = getTemplateNames();
    const isValidTemplate = validTemplates.includes(params.templateName);

    if (!isValidTemplate) {
      // Redirect to first valid template
      const firstTemplate = validTemplates[0];
      if (firstTemplate) {
        throw redirect({
          to: "/email/$templateName",
          params: { templateName: firstTemplate },
        });
      }
    }
  },
});

function RouteComponent() {
  const { templateName } = Route.useParams();
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  const { html, loading } = useRender(templateName);
  const { send, sending } = useSend();
  const { lastEmail, saveLastEmail } = useLastEmail();

  const handleViewModeChange = (mode: "desktop" | "mobile") => {
    setViewMode(mode);
  };

  const handleSend = async () => {
    if (!testEmail || !templateName) return;

    try {
      await send(templateName, testEmail);
      saveLastEmail(testEmail);
      // Save email to memory after successful send
      setShowSendDialog(false);
      setTestEmail("");
      toast.success(`Email sent to ${testEmail}`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to send email");
    }
  };

  return (
    <>
      <Toolbar
        onSendTestClick={() => setShowSendDialog(true)}
        onViewModeChange={handleViewModeChange}
        templateName={templateName}
        viewMode={viewMode}
      />

      <PreviewArea html={html} loading={loading} viewMode={viewMode} />

      <SendDialog
        lastEmail={lastEmail}
        onEmailChange={setTestEmail}
        onOpenChange={setShowSendDialog}
        onSend={handleSend}
        open={showSendDialog}
        sending={sending}
        templateName={templateName}
        testEmail={testEmail}
      />
    </>
  );
}
