import type { z } from "zod";
import { envs } from "../envs";
import type { MailerSchema } from "../types";
import { Mailer } from "./base";

const env = envs();

type Config = z.infer<typeof MailerSchema>;

export function createNodemailerService() {
  return new Nodemailer();
}

/**
 * A class representing a mailer using Nodemailer library.
 * @implements {Mailer}
 */
class Nodemailer extends Mailer {
  async sendEmail(config: Config) {
    const { createTransport } = await import("nodemailer");
    const transporter = createTransport({
      host: env.MAIL_HOST,
      port: env.MAIL_PORT,
      secure: env.MAIL_SECURE,
      auth: {
        user: env.MAIL_USER,
        pass: env.MAIL_PASSWORD,
      },
    });
    const html = await this.render(config.template);

    const result = await transporter.sendMail({
      ...config,
      html,
    });

    // Return standardized result with messageId
    return {
      messageId: result.messageId,
    };
  }
}
