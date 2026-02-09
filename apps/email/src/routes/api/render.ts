import { render } from "@react-email/render";
import { createFileRoute } from "@tanstack/react-router";
import { createElement } from "react";
import { getEmailTemplate } from "../../lib/emails";

type RenderRequest = {
  templateName: string;
};

/**
 * API route for rendering email templates to HTML
 * POST /api/render
 */
export const Route = createFileRoute("/api/render")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const data: RenderRequest = await request.json();

          // Validate input
          if (!data.templateName) {
            return Response.json(
              { error: "Missing required field: templateName" },
              { status: 400 },
            );
          }

          // Get template using the utility function
          const Template = getEmailTemplate(data.templateName);
          if (!Template || typeof Template !== "function") {
            return Response.json({ error: "Template not found" }, { status: 404 });
          }

          // Get preview props and create React element
          const props = (Template as any).PreviewProps || {};
          const templateElement = createElement(Template as any, props);

          // Render email template to HTML
          const html = await render(templateElement);

          return Response.json({ html });
        } catch (error) {
          console.error("Error rendering email:", error);
          return Response.json(
            {
              error: error instanceof Error ? error.message : "Internal server error",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
