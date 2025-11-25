import { Separator } from "@raypx/ui/components/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@raypx/ui/components/sidebar";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Sidebar } from "../../components/sidebar";
import { getEmailMenuTree, getTemplateNames } from "../../lib/emails";

/**
 * Layout route for email preview pages
 * Provides the sidebar and main content area structure
 */
export const Route = createFileRoute("/email")({
  loader: ({ location }) => {
    const menuTree = getEmailMenuTree();
    const templateNames = getTemplateNames();
    const currentTemplateName = location.pathname.replace(/^\/email\/?/, "");
    const isValidTemplate = currentTemplateName && templateNames.includes(currentTemplateName);

    // Redirect to first template if current path is invalid
    if (!currentTemplateName || !isValidTemplate) {
      const fallbackTemplate = templateNames[0];

      if (fallbackTemplate) {
        throw redirect({
          to: "/email/$",
          params: { _splat: fallbackTemplate },
        });
      }
    }

    return { menuTree, currentTemplateName };
  },
  component: EmailLayout,
});

function EmailLayout() {
  const { menuTree, currentTemplateName } = Route.useLoaderData();

  return (
    <SidebarProvider>
      <Sidebar currentTemplateName={currentTemplateName} menuTree={menuTree} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator className="mr-2 h-4" orientation="vertical" />
          </div>
        </header>
        <main className="flex-1 flex flex-col overflow-hidden">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
