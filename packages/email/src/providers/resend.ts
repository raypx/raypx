import { Resend } from "resend";
import type { z } from "zod";
import { envs } from "../envs";
import type { MailerSchema } from "../types";
import { Mailer } from "./base";

type Config = z.infer<typeof MailerSchema>;
const env = envs();

/**
 * A class representing a mailer using the Resend HTTP API.
 * @implements {Mailer}
 */
class ResendMailer extends Mailer {
  async sendEmail(config: Config) {
    try {
      // Validate API key
      const apiKey = env.AUTH_RESEND_KEY;
      if (!apiKey || !apiKey.startsWith("re_")) {
        throw new Error(
          "Invalid Resend API key. Please set AUTH_RESEND_KEY environment variable with a valid key starting with 're_'",
        );
      }

      const html = await this.render(config.template);
      const resend = new Resend(apiKey);

      const result = await resend.emails.send({
        from: config.from,
        to: config.to,
        subject: config.subject,
        html,
      });

      if (result.error) {
        // Provide more detailed error information
        const errorMessage = result.error.message || "Unknown Resend API error";
        const errorDetails = result.error.name
          ? `${result.error.name}: ${errorMessage}`
          : errorMessage;
        throw new Error(`Resend API error: ${errorDetails}`);
      }

      // Return standardized result with id
      return {
        id: result.data?.id,
      };
    } catch (error) {
      // Re-throw with more context if it's already an Error
      if (error instanceof Error) {
        // Check if it's a network/fetch error
        if (error.message.includes("fetch") || error.message.includes("Unable to fetch")) {
          throw new Error(
            `Resend API connection failed: ${error.message}. Please check your network connection and API key configuration.`,
          );
        }
        throw error;
      }
      // Handle non-Error objects
      throw new Error(`Unexpected error sending email via Resend: ${String(error)}`);
    }
  }
}

export function createResendMailer() {
  return new ResendMailer();
}
