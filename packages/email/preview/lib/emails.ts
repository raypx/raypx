/**
 * Email templates registry
 * Dynamically loads all email templates using import.meta.glob
 * This automatically discovers all email template files without manual maintenance
 */
import type { ComponentType } from "react";

// Use import.meta.glob to dynamically import all email template files from src/emails
const emailModules = import.meta.glob<{ default: ComponentType<any>; PreviewProps?: any }>(
  "../../src/emails/*-email.tsx",
  { eager: true },
);

/**
 * Extract template name from file path
 * Example: "../../src/emails/welcome-email.tsx" -> "WelcomeEmail"
 * Example: "../../src/emails/api-key-created-email.tsx" -> "ApiKeyCreatedEmail"
 */
function getTemplateName(path: string): string {
  // Extract filename from path (e.g., "../../src/emails/welcome-email.tsx" -> "welcome-email.tsx")
  const filename = path.split("/").pop()?.replace(".tsx", "") || "";
  // Convert kebab-case to PascalCase
  return filename
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

/**
 * Email templates registry
 * Maps template names to their React components
 */
export const emailTemplates = Object.entries(emailModules).reduce(
  (acc, [path, module]) => {
    const templateName = getTemplateName(path);
    if (module.default) {
      acc[templateName] = module.default;
    }
    return acc;
  },
  {} as Record<string, ComponentType<any>>,
);

/**
 * Get email template by name
 * @param templateName - Template name (e.g., "WelcomeEmail")
 * @returns React component or undefined if not found
 */
export function getEmailTemplate(templateName: string): ComponentType<any> | undefined {
  return emailTemplates[templateName as keyof typeof emailTemplates];
}

/**
 * Get all available template names
 */
export function getTemplateNames(): string[] {
  return Object.keys(emailTemplates);
}

/**
 * Type for template names
 */
export type TemplateName = keyof typeof emailTemplates;
