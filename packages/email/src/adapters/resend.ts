import type { z } from "zod";
import { CacheKeys, cacheGetOrSet } from "../cache";
import { envs } from "../envs";
import type { MailerSchema } from "../types";
import { BaseEmailAdapter } from "./base";
import type { EmailAdapterConfig, EmailAdapterResult } from "./types";

type Config = z.infer<typeof MailerSchema>;

/**
 * Resend adapter configuration
 */
class ResendAdapterConfig implements EmailAdapterConfig {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  validate(): void {
    if (!this.apiKey || !this.apiKey.startsWith("re_")) {
      throw new Error(
        "Invalid Resend API key. Please set AUTH_RESEND_KEY environment variable with a valid key starting with 're_'",
      );
    }
  }

  async checkDependencies(): Promise<void> {
    // Dynamically check if resend package is available (with caching)
    try {
      await cacheGetOrSet(CacheKeys.RESEND_MODULE, async () => {
        // @ts-expect-error - Optional dependency
        return await import("resend");
      });
    } catch (error) {
      throw new Error("Resend package is not installed. Please install it using: pnpm add resend");
    }
  }

  getApiKey(): string {
    return this.apiKey;
  }
}

/**
 * Resend email adapter
 * Sends emails using Resend HTTP API with dynamic dependency loading and caching
 */
export class ResendAdapter extends BaseEmailAdapter {
  protected config?: ResendAdapterConfig;

  constructor() {
    super("resend");
    this.initializeConfig();
  }

  private initializeConfig(): void {
    const env = envs();
    this.config = new ResendAdapterConfig(env.AUTH_RESEND_KEY);
  }

  protected async initialize(): Promise<void> {
    if (this.config) {
      await this.config.validate();
      await this.config.checkDependencies();
    }
  }

  async sendEmail(config: Config): Promise<EmailAdapterResult> {
    await this.initialize();

    // Dynamically import Resend with caching
    const resendModule = await cacheGetOrSet(CacheKeys.RESEND_MODULE, async () => {
      // @ts-expect-error - Optional dependency
      return await import("resend");
    });

    if (!this.config) {
      throw new Error("Resend adapter not configured");
    }

    const html = await this.render(config.template);
    // @ts-expect-error - Optional dependency
    const { Resend } = resendModule;
    const resend = new Resend(this.config.getApiKey());

    const result = await resend.emails.send({
      from: config.from,
      to: config.to,
      subject: config.subject,
      html,
    });

    if (result.error) {
      const errorMessage = result.error.message || "Unknown Resend API error";
      const errorDetails = result.error.name
        ? `${result.error.name}: ${errorMessage}`
        : errorMessage;
      throw new Error(`Resend API error: ${errorDetails}`);
    }

    return {
      id: result.data?.id,
    };
  }
}

/**
 * Factory function to create Resend adapter
 */
export function createResendAdapter(): ResendAdapter {
  return new ResendAdapter();
}
