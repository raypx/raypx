import { toast } from "@raypx/ui/components/toast";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PreviewArea } from "../../components/preview-area";
import { SendDialog } from "../../components/send-dialog";
import { Toolbar } from "../../components/toolbar";
import { useLastEmail } from "../../components/use-last-email";
import { useRender } from "../../components/use-render";
import { useSend } from "../../components/use-send";
import { useSendDialog } from "../../components/use-send-dialog";
import { useSource } from "../../components/use-source";
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
  const [width, setWidth] = useState(375);
  const [height, setHeight] = useState(667);
  const [displayMode, setDisplayMode] = useState<"preview" | "tsx">("preview");

  // Update default dimensions based on view mode
  useEffect(() => {
    if (viewMode === "mobile") {
      setWidth(375);
      setHeight(667);
    } else {
      setWidth(1400);
      setHeight(800);
    }
  }, [viewMode]);

  const { html, loading } = useRender(templateName);
  const { source, loading: sourceLoading } = useSource(templateName);
  const { send, sending } = useSend();
  const { lastEmail, saveLastEmail } = useLastEmail();
  const sendDialog = useSendDialog(templateName);

  const handleSend = async () => {
    if (!sendDialog.testEmail || !templateName) return;

    try {
      await send(templateName, sendDialog.testEmail, sendDialog.subject || undefined);
      saveLastEmail(sendDialog.testEmail);
      sendDialog.closeDialog();
      toast.success(`Email sent to ${sendDialog.testEmail}`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to send email");
    }
  };

  return (
    <>
      <Toolbar
        displayMode={displayMode}
        height={height}
        onDisplayModeChange={setDisplayMode}
        onHeightChange={setHeight}
        onSendTestClick={sendDialog.openDialog}
        onViewModeChange={setViewMode}
        onWidthChange={setWidth}
        templateName={templateName}
        viewMode={viewMode}
        width={width}
      />

      <PreviewArea
        displayMode={displayMode}
        height={height}
        html={html}
        loading={loading}
        source={source}
        sourceLoading={sourceLoading}
        viewMode={viewMode}
        width={width}
      />

      <SendDialog
        lastEmail={lastEmail}
        onEmailChange={sendDialog.setTestEmail}
        onOpenChange={sendDialog.handleOpenChange}
        onSend={handleSend}
        onSubjectChange={sendDialog.setSubject}
        open={sendDialog.open}
        sending={sending}
        subject={sendDialog.subject}
        templateName={templateName}
        testEmail={sendDialog.testEmail}
      />
    </>
  );
}
