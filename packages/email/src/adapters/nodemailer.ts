import type { z } from "zod";
import { CacheKeys, cacheGetOrSet } from "../cache";
import { envs } from "../envs";
import type { MailerSchema } from "../types";
import { BaseEmailAdapter } from "./base";
import type { EmailAdapterConfig, EmailAdapterResult } from "./types";

type Config = z.infer<typeof MailerSchema>;

/**
 * Nodemailer adapter configuration
 */
class NodemailerAdapterConfig implements EmailAdapterConfig {
  private host: string | undefined;
  private port: number | undefined;
  private secure: boolean | undefined;
  private user?: string;
  private pass?: string;

  constructor(
    host: string | undefined,
    port: number | undefined,
    secure: boolean | undefined,
    user?: string,
    pass?: string,
  ) {
    this.host = host;
    this.port = port;
    this.secure = secure;
    this.user = user;
    this.pass = pass;
  }

  validate(): void {
    if (!this.host) {
      throw new Error("MAIL_HOST is required for Nodemailer adapter");
    }
    if (this.port === undefined) {
      throw new Error("MAIL_PORT is required for Nodemailer adapter");
    }
  }

  async checkDependencies(): Promise<void> {
    // Dynamically check if nodemailer package is available (with caching)
    try {
      await cacheGetOrSet(CacheKeys.NODEMAILER_MODULE, async () => {
        // @ts-expect-error - Optional dependency
        return await import("nodemailer");
      });
    } catch (error) {
      throw new Error(
        "Nodemailer package is not installed. Please install it using: pnpm add nodemailer",
      );
    }
  }

  getTransportConfig() {
    return {
      host: this.host || "localhost",
      port: this.port || 587, // Default to 587 if not specified
      secure: this.secure ?? false, // Default to false if not specified
      auth:
        this.user && this.pass
          ? {
              user: this.user,
              pass: this.pass,
            }
          : undefined,
    };
  }
}

/**
 * Nodemailer adapter
 * Sends emails using SMTP with dynamic dependency loading
 */
export class NodemailerAdapter extends BaseEmailAdapter {
  protected config?: NodemailerAdapterConfig;

  constructor() {
    super("nodemailer");
    this.initializeConfig();
  }

  private initializeConfig(): void {
    const env = envs();
    this.config = new NodemailerAdapterConfig(
      env.MAIL_HOST,
      env.MAIL_PORT,
      env.MAIL_SECURE,
      env.MAIL_USER,
      env.MAIL_PASSWORD,
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

    // Dynamically import Nodemailer with caching
    const nodemailerModule = await cacheGetOrSet(CacheKeys.NODEMAILER_MODULE, async () => {
      // @ts-expect-error - Optional dependency
      return await import("nodemailer");
    });

    if (!this.config) {
      throw new Error("Nodemailer adapter not configured");
    }

    const transportConfig = this.config.getTransportConfig();
    // @ts-expect-error - Optional dependency
    const { createTransport } = nodemailerModule;
    const transporter = createTransport(transportConfig);
    const html = await this.render(config.template);

    const result = await transporter.sendMail({
      from: config.from,
      to: config.to,
      subject: config.subject,
      html,
    });

    return {
      messageId: result.messageId,
    };
  }
}

/**
 * Factory function to create Nodemailer adapter
 */
export function createNodemailerAdapter(): NodemailerAdapter {
  return new NodemailerAdapter();
}
