/**
 * Email templates registry
 * Dynamically loads all email templates using import.meta.glob
 * This automatically discovers all email template files without manual maintenance
 */
import type { ComponentType } from "react";

// Use import.meta.glob to dynamically import all email template files from src/emails
const emailModules = import.meta.glob<{ default: ComponentType<any>; PreviewProps?: any }>(
  "../../src/emails/**/*.tsx",
  { eager: true, base: "../../src/emails" },
);

// Map to store email paths without baseDir and file extension
const emails = new Map<string, string>();

// Process emailModules and populate the map
Object.keys(emailModules).forEach((relativePath) => {
  // Remove leading "./" if present (e.g., "./welcome-email.tsx" -> "welcome-email.tsx")
  const pathWithoutPrefix = relativePath.startsWith("./") ? relativePath.slice(2) : relativePath;

  // Remove .tsx extension
  const pathWithoutExt = pathWithoutPrefix.replace(/\.tsx$/, "");

  // Store in map: key is the path without extension, value is the original relative path
  emails.set(pathWithoutExt, relativePath);
});

/**
 * Extract template name from file path, including directory structure
 * Example: "./welcome-email.tsx" -> "welcome-email"
 * Example: "./auth/reset-password-email.tsx" -> "auth/reset-password-email"
 * Example: "./api-key-created-email.tsx" -> "api-key-created-email"
 */
function getTemplateName(relativePath: string): string {
  // Remove leading "./" if present (e.g., "./welcome-email.tsx" -> "welcome-email.tsx")
  const pathWithoutPrefix = relativePath.startsWith("./") ? relativePath.slice(2) : relativePath;

  // Remove .tsx extension
  return pathWithoutPrefix.replace(/\.tsx$/, "");
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
 * Menu item structure for hierarchical navigation
 */
export interface EmailMenuItem {
  label: string;
  path: string;
  templateName: string;
  children?: EmailMenuItem[];
}

/**
 * Internal type for building tree structure (children as object)
 */
interface EmailMenuItemBuilder {
  label: string;
  path: string;
  templateName: string;
  children?: Record<string, EmailMenuItemBuilder> | EmailMenuItem[];
}

/**
 * Build hierarchical menu structure from email paths
 */
export function getEmailMenuTree(): EmailMenuItem[] {
  const tree: Record<string, EmailMenuItemBuilder> = {};

  // Process all email paths
  emails.forEach((relativePath, pathWithoutExt) => {
    const segments = pathWithoutExt.split("/").filter(Boolean);
    if (segments.length === 0) return;

    const templateName = getTemplateName(relativePath);

    // Build tree structure
    let current: Record<string, EmailMenuItemBuilder> = tree;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (!segment) continue;

      const isLeaf = i === segments.length - 1;

      if (!current[segment]) {
        // Convert segment to label (kebab-case to Title Case)
        const label = segment
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(" ");

        current[segment] = {
          label,
          path: pathWithoutExt,
          templateName: isLeaf ? templateName : "",
          children: isLeaf ? undefined : {},
        };
      }

      if (!isLeaf) {
        const node = current[segment];
        if (node?.children && typeof node.children === "object" && !Array.isArray(node.children)) {
          current = node.children as Record<string, EmailMenuItemBuilder>;
        }
      }
    }
  });

  // Convert children objects to arrays
  function convertToArray(node: EmailMenuItemBuilder): EmailMenuItem {
    const result: EmailMenuItem = {
      label: node.label,
      path: node.path,
      templateName: node.templateName,
    };

    if (node.children) {
      if (Array.isArray(node.children)) {
        result.children = node.children.map(convertToArray);
      } else {
        result.children = Object.values(node.children).map(convertToArray);
      }
    }

    return result;
  }

  return Object.values(tree).map(convertToArray);
}

/**
 * Type for template names
 */
export type TemplateName = keyof typeof emailTemplates;
