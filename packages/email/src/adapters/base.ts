import { render } from "@react-email/render";
import type { ReactElement } from "react";
import type { z } from "zod";
import type { MailerSchema } from "../types";
import type { EmailAdapter, EmailAdapterConfig, EmailAdapterResult } from "./types";

/**
 * Abstract base class for email adapters
 * Provides common functionality for all adapters
 */
export abstract class BaseEmailAdapter implements EmailAdapter {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Send an email (must be implemented by subclass)
   */
  abstract sendEmail(data: z.infer<typeof MailerSchema>): Promise<EmailAdapterResult>;

  /**
   * Render email template to HTML
   */
  async render(template: ReactElement | string): Promise<string> {
    if (typeof template === "string") {
      return template;
    }
    return await render(template);
  }
}
