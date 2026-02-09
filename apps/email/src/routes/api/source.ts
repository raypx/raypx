import { readFileSync } from "node:fs";
import { createFileRoute } from "@tanstack/react-router";
import { getEmailTemplatePath, getTemplateNames } from "../../lib/emails";

type SourceRequest = {
  templateName: string;
};

/**
 * Get the file path for a template name
 * Example: "welcome-email" -> "/path/to/packages/email/src/emails/welcome-email.tsx"
 */
function getTemplateFilePath(templateName: string): string | null {
  // Try to find the file
  const templateNames = getTemplateNames();
  if (!templateNames.includes(templateName)) {
    return null;
  }

  return getEmailTemplatePath(templateName);
}

/**
 * API route for getting email template source code
 * POST /api/source
 */
export const Route = createFileRoute("/api/source")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const data: SourceRequest = await request.json();

          // Validate input
          if (!data.templateName) {
            return Response.json(
              { error: "Missing required field: templateName" },
              { status: 400 },
            );
          }

          // Get file path
          const filePath = getTemplateFilePath(data.templateName);
          if (!filePath) {
            return Response.json({ error: "Template not found" }, { status: 404 });
          }

          // Read file
          try {
            const sourceCode = readFileSync(filePath, "utf-8");
            return Response.json({ source: sourceCode, language: "tsx" });
          } catch (error) {
            console.error("Error reading file:", error);
            return Response.json(
              {
                error: error instanceof Error ? error.message : "Failed to read source file",
              },
              { status: 500 },
            );
          }
        } catch (error) {
          console.error("Error getting source:", error);
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
