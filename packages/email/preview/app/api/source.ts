import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { getTemplateNames } from "../../lib/emails";

type SourceRequest = {
  templateName: string;
};

/**
 * Get the file path for a template name
 * Example: "WelcomeEmail" -> "welcome-email.tsx"
 */
function getTemplateFilePath(templateName: string): string | null {
  // Convert PascalCase to kebab-case
  const kebabCase = templateName
    .replace(/([A-Z])/g, "-$1")
    .toLowerCase()
    .replace(/^-/, "");

  // Try to find the file
  const templateNames = getTemplateNames();
  if (!templateNames.includes(templateName)) {
    return null;
  }

  // Get the current file's directory (preview/app/api)
  const currentFileDir = dirname(fileURLToPath(import.meta.url));
  // Resolve the path: from preview/app/api, go up to packages/email root
  // preview/app/api -> preview -> packages/email
  const emailPackageRoot = resolve(currentFileDir, "../../..");
  // Then go to src/emails
  const emailTemplatesDir = join(emailPackageRoot, "src/emails");
  const filePath = join(emailTemplatesDir, `${kebabCase}.tsx`);

  return filePath;
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
            return json({ error: "Missing required field: templateName" }, { status: 400 });
          }

          // Get file path
          const filePath = getTemplateFilePath(data.templateName);
          if (!filePath) {
            return json({ error: "Template not found" }, { status: 404 });
          }

          // Read file
          try {
            const sourceCode = readFileSync(filePath, "utf-8");
            return json({ source: sourceCode, language: "tsx" });
          } catch (error) {
            console.error("Error reading file:", error);
            return json(
              {
                error: error instanceof Error ? error.message : "Failed to read source file",
              },
              { status: 500 },
            );
          }
        } catch (error) {
          console.error("Error getting source:", error);
          return json(
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
