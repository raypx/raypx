/// <reference types="vite/client" />
/// <reference types="@tanstack/react-router/vite" />

/**
 * Virtual module for email templates
 */
declare module "virtual:emails/templates" {
  import type { ComponentType } from "react";

  /**
   * Email template module type
   */
  interface EmailTemplateModule {
    default: ComponentType<any>;
    PreviewProps?: Record<string, any>;
  }

  export const emailModules: Record<string, EmailTemplateModule>;
  export default emailModules;
}
