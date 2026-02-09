/**
 * Email templates registry
 * Dynamically loads all email templates using virtual module
 * This automatically discovers all email template files without manual maintenance
 */

import { emailModules } from "virtual:emails/templates";
import type { ComponentType } from "react";

// Constants for path processing
const TSX_EXTENSION = /\.tsx$/;

/**
 * Email templates registry
 * Maps template names to their React components
 * Simplified to only store what's actually used
 */
export const emailTemplates: Record<string, ComponentType<any>> = Object.fromEntries(
  Object.entries(emailModules)
    .filter(([, module]) => module?.default)
    .map(([templateName, module]) => [templateName, module.default]),
);

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
 * Memoization cache for segment labels to avoid repeated conversions
 */
const labelCache = new Map<string, string>();

/**
 * Convert path segment to display label with memoization
 * Example: "reset-password" -> "Reset Password"
 */
function segmentToLabel(segment: string): string {
  const cached = labelCache.get(segment);
  if (cached) return cached;

  const label = segment
    .replace(TSX_EXTENSION, "")
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  labelCache.set(segment, label);
  return label;
}

/**
 * Build hierarchical menu structure from email templates
 */
export function buildEmailMenuTree(): EmailMenuItem[] {
  const tree: Record<string, EmailMenuItemBuilder> = {};

  // Process all email templates
  Object.keys(emailTemplates).forEach((templateName) => {
    // Convert template name to path segments
    // e.g., "auth/reset-password" -> ["auth", "reset-password.tsx"]
    const relativePath = `${templateName}.tsx`;
    const segments = relativePath.split("/").filter(Boolean);
    if (segments.length === 0) return;

    // Build tree structure
    let current: Record<string, EmailMenuItemBuilder> = tree;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (!segment) continue;

      const isLeaf = i === segments.length - 1;

      if (!current[segment]) {
        current[segment] = {
          label: segmentToLabel(segment),
          path: relativePath,
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

  const sortMenuItems = (items: EmailMenuItem[]): EmailMenuItem[] =>
    [...items].sort((a, b) => a.label.localeCompare(b.label));

  // Convert children objects to arrays
  function convertToArray(node: EmailMenuItemBuilder): EmailMenuItem {
    const result: EmailMenuItem = {
      label: node.label,
      path: node.path,
      templateName: node.templateName,
    };

    if (node.children) {
      const childrenArray = Array.isArray(node.children)
        ? node.children.map(convertToArray)
        : Object.values(node.children).map(convertToArray);

      result.children = sortMenuItems(childrenArray);
    }

    return result;
  }

  return sortMenuItems(Object.values(tree).map(convertToArray));
}

/**
 * Cache for menu tree and template names
 * In development mode, cache is invalidated on HMR updates
 */
let cachedMenuTree: EmailMenuItem[] | null = null;
let cachedTemplateNames: string[] | null = null;

/**
 * Clear all caches (useful for HMR in development)
 */
function clearCaches(): void {
  cachedMenuTree = null;
  cachedTemplateNames = null;
  labelCache.clear();
}

/**
 * Setup HMR support in development mode
 * Automatically clears caches when email templates are updated
 * This works in conjunction with the emailTemplatesHmr Vite plugin
 */
if (import.meta.hot) {
  // Accept HMR updates for this module
  import.meta.hot.accept(() => {
    clearCaches();
  });

  // Listen for custom email templates update event from our Vite plugin
  import.meta.hot.on("email-templates-update", (_data: { file: string }) => {
    clearCaches();
  });

  // Clear caches before any update
  import.meta.hot.on("vite:beforeUpdate", () => {
    clearCaches();
  });

  // Dispose handler to clean up when module is replaced
  import.meta.hot.dispose(() => {
    clearCaches();
  });
}

/**
 * Get email menu tree
 * This function should be called in route loaders for server-side rendering
 * Results are cached for optimal performance
 */
export function getEmailMenuTree(): EmailMenuItem[] {
  if (!cachedMenuTree) {
    cachedMenuTree = buildEmailMenuTree();
  }
  return cachedMenuTree;
}

/**
 * Get email template component by name
 * @param templateName - Template name (e.g., "welcome-email" or "auth/reset-password")
 * @returns React component or undefined if not found
 */
export function getEmailTemplate(templateName: string): ComponentType<any> | undefined {
  return emailTemplates[templateName];
}

/**
 * Get all available template names with caching
 * Significantly faster than repeatedly calling Object.keys()
 */
export function getTemplateNames(): string[] {
  if (!cachedTemplateNames) {
    cachedTemplateNames = Object.keys(emailTemplates);
  }
  return cachedTemplateNames;
}

/**
 * Get the file system path for an email template
 * @param templateName - Template name (e.g., "welcome-email" or "auth/reset-password")
 * @returns Full file system path or empty string if not found
 * Note: This is only used for displaying source code in dev mode
 */
export function getEmailTemplatePath(templateName: string): string {
  // Check if template exists
  if (!emailTemplates[templateName]) return "";

  // Construct path from template name
  // e.g., "welcome-email" -> "/path/to/packages/email-templates/src/emails/welcome-email.tsx"
  // e.g., "auth/reset-password" -> "/path/to/packages/email-templates/src/emails/auth/reset-password.tsx"
  const baseDir = new URL("../../../../packages/email-templates/src/emails", import.meta.url)
    .pathname;
  return `${baseDir}/${templateName}.tsx`;
}
