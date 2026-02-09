import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
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
  return (
    <div className="h-screen w-full overflow-hidden">
      <Outlet />
    </div>
  );
}
