import type { z } from "zod";
import { CacheKeys, cacheGetOrSet } from "../cache";
import { envs } from "../envs";
import type { MailerSchema } from "../types";
import { BaseEmailAdapter } from "./base";
import type { EmailAdapterConfig, EmailAdapterResult } from "./types";

type Config = z.infer<typeof MailerSchema>;

/**
 * SendGrid adapter configuration
 */
class SendGridAdapterConfig implements EmailAdapterConfig {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  validate(): void {
    if (!this.apiKey) {
      throw new Error("Invalid SendGrid API key. Please set SENDGRID_API_KEY environment variable");
    }
  }

  async checkDependencies(): Promise<void> {
    try {
      await cacheGetOrSet(CacheKeys.SENDGRID_MODULE, async () => {
        // @ts-expect-error - Optional dependency
        return await import("@sendgrid/mail");
      });
    } catch (error) {
      throw new Error(
        "SendGrid package is not installed. Please install it using: pnpm add @sendgrid/mail",
      );
    }
  }

  getApiKey(): string {
    return this.apiKey;
  }
}

/**
 * SendGrid email adapter
 * Sends emails using SendGrid API with dynamic dependency loading
 *
 * @example
 * // Environment variables needed:
 * // SENDGRID_API_KEY=your_sendgrid_api_key
 *
 * // Package installation:
 * // pnpm add @sendgrid/mail
 */
export class SendGridAdapter extends BaseEmailAdapter {
  protected config?: SendGridAdapterConfig;

  constructor() {
    super("sendgrid");
    this.initializeConfig();
  }

  private initializeConfig(): void {
    const env = envs();
    // Try to get SendGrid API key from environment
    const apiKey = (env as any).SENDGRID_API_KEY || "";
    this.config = new SendGridAdapterConfig(apiKey);
  }

  protected async initialize(): Promise<void> {
    if (this.config) {
      await this.config.validate();
      await this.config.checkDependencies();
    }
  }

  async sendEmail(config: Config): Promise<EmailAdapterResult> {
    await this.initialize();

    // Dynamically import SendGrid with caching
    const sgModule = await cacheGetOrSet(CacheKeys.SENDGRID_MODULE, async () => {
      // @ts-expect-error - Optional dependency
      return await import("@sendgrid/mail");
    });

    if (!this.config) {
      throw new Error("SendGrid adapter not configured");
    }

    const sgMail = sgModule.default || sgModule;
    sgMail.setApiKey(this.config.getApiKey());
    const html = await this.render(config.template);

    const result = await sgMail.send({
      from: config.from,
      to: config.to,
      subject: config.subject,
      html,
    });

    return {
      id: result[0]?.headers?.["x-message-id"],
    };
  }
}

/**
 * Factory function to create SendGrid adapter
 */
export function createSendGridAdapter(): SendGridAdapter {
  return new SendGridAdapter();
}
