import type { z } from "zod";
import { CacheKeys, cacheGetOrSet } from "../cache";
import { envs } from "../envs";
import type { MailerSchema } from "../types";
import { BaseEmailAdapter } from "./base";
import type { EmailAdapterConfig, EmailAdapterResult } from "./types";

type Config = z.infer<typeof MailerSchema>;

/**
 * AWS SES adapter configuration
 */
class SESAdapterConfig implements EmailAdapterConfig {
  private region?: string;
  private accessKeyId?: string;
  private secretAccessKey?: string;

  constructor(region?: string, accessKeyId?: string, secretAccessKey?: string) {
    this.region = region;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
  }

  validate(): void {
    // AWS SDK can use environment variables or AWS credentials file
    // So we don't strictly require all parameters to be set here
  }

  async checkDependencies(): Promise<void> {
    try {
      await cacheGetOrSet(CacheKeys.AWS_SES_MODULE, async () => {
        // @ts-expect-error - Optional dependency
        return await import("@aws-sdk/client-ses");
      });
    } catch (error) {
      throw new Error(
        "AWS SES SDK is not installed. Please install it using: pnpm add @aws-sdk/client-ses",
      );
    }
  }

  getConfig() {
    return {
      region: this.region,
      credentials:
        this.accessKeyId && this.secretAccessKey
          ? {
              accessKeyId: this.accessKeyId,
              secretAccessKey: this.secretAccessKey,
            }
          : undefined,
    };
  }
}

/**
 * AWS SES email adapter
 * Sends emails using AWS Simple Email Service with dynamic dependency loading
 *
 * @example
 * // Environment variables needed:
 * // AWS_REGION=us-east-1
 * // AWS_ACCESS_KEY_ID=your_access_key
 * // AWS_SECRET_ACCESS_KEY=your_secret_key
 *
 * // Package installation:
 * // pnpm add @aws-sdk/client-ses
 */
export class SESAdapter extends BaseEmailAdapter {
  protected config?: SESAdapterConfig;

  constructor() {
    super("aws-ses");
    this.initializeConfig();
  }

  private initializeConfig(): void {
    const env = envs();
    // Try to get AWS credentials from environment
    this.config = new SESAdapterConfig(
      (env as any).AWS_REGION,
      (env as any).AWS_ACCESS_KEY_ID,
      (env as any).AWS_SECRET_ACCESS_KEY,
    );
  }

  protected async initialize(): Promise<void> {
    if (this.config) {
      await this.config.validate();
      await this.config.checkDependencies();
    }
  }

  async sendEmail(config: Config): Promise<EmailAdapterResult> {
    await this.initialize();

    // Dynamically import AWS SES SDK with caching
    const sesModule = await cacheGetOrSet(CacheKeys.AWS_SES_MODULE, async () => {
      // @ts-expect-error - Optional dependency
      return await import("@aws-sdk/client-ses");
    });

    if (!this.config) {
      throw new Error("AWS SES adapter not configured");
    }

    // @ts-expect-error - Optional dependency
    const { SESClient, SendEmailCommand } = sesModule;
    const client = new SESClient(this.config.getConfig());
    const html = await this.render(config.template);

    const command = new SendEmailCommand({
      Source: config.from,
      Destination: {
        ToAddresses: [config.to],
      },
      Message: {
        Subject: {
          Data: config.subject,
        },
        Body: {
          Html: {
            Data: html,
          },
        },
      },
    });

    const result = await client.send(command);

    return {
      id: result.MessageId,
    };
  }
}

/**
 * Factory function to create AWS SES adapter
 */
export function createSESAdapter(): SESAdapter {
  return new SESAdapter();
}
