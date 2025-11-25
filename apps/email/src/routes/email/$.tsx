import { createFileRoute, redirect } from "@tanstack/react-router";
import { Workspace } from "../../components/workspace";
import { getEmailMenuTree, getTemplateNames } from "../../lib/emails";

export const Route = createFileRoute("/email/$")({
  component: RouteComponent,
  beforeLoad: ({ params }) => {
    const slug = params._splat || "";
    // Validate template name at route level
    const validTemplates = getTemplateNames();
    const isValidTemplate = validTemplates.includes(slug);

    if (!isValidTemplate) {
      // Redirect to first valid template
      const firstTemplate = validTemplates[0];
      if (firstTemplate) {
        throw redirect({
          to: "/email/$",
          params: { _splat: firstTemplate },
        });
      }
    }
  },
});

function RouteComponent() {
  const { _splat: slug = "" } = Route.useParams();
  // Get menuTree directly since parent route loader provides it
  const menuTree = getEmailMenuTree();

  return <Workspace menuTree={menuTree} templateName={slug} />;
}
