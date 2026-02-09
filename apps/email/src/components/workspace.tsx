import { SidebarProvider } from "@raypx/ui/components/sidebar";
import { useLastEmail } from "../hooks/use-last";
import { useTemplatePreview } from "../hooks/use-preview";
import type { EmailMenuItem } from "../lib/emails";
import { Editor } from "./editor";
import { Sidebar } from "./sidebar";

interface WorkspaceProps {
  menuTree: EmailMenuItem[];
  templateName: string;
}

export function Workspace({ menuTree, templateName }: WorkspaceProps) {
  const { defaultSubject } = useTemplatePreview(templateName);
  const { lastEmail } = useLastEmail();

  const previewSubject = defaultSubject || "Email Preview";
  const previewRecipient = lastEmail || "preview@example.com";
  const previewSender = "hello@raypx.com";

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar menuTree={menuTree} selectedTemplateName={templateName} />
        <Editor
          from={previewSender}
          menuTree={menuTree}
          subject={previewSubject}
          templateName={templateName}
          to={previewRecipient}
        />
      </div>
    </SidebarProvider>
  );
}
