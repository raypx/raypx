import type { ReactElement } from "react";
import type { z } from "zod";
import type { MailerSchema } from "../types";

/**
 * Email adapter configuration
 */
export interface EmailAdapterConfig {
  /**
   * Validate the adapter configuration
   */
  validate(): Promise<void> | void;

  /**
   * Check if all required dependencies are available
   */
  checkDependencies(): Promise<void> | void;
}

/**
 * Email adapter result
 */
export interface EmailAdapterResult {
  id?: string;
  messageId?: string;
  [key: string]: unknown;
}

/**
 * Email adapter interface
 * All email providers must implement this interface
 */
export interface EmailAdapter {
  /**
   * Adapter name/identifier
   */
  readonly name: string;

  /**
   * Send an email
   */
  sendEmail(data: z.infer<typeof MailerSchema>): Promise<EmailAdapterResult>;

  /**
   * Render email template to HTML
   */
  render(template: ReactElement | string): Promise<string>;
}
