import { Resend } from "resend";
import type { z } from "zod";
import { envs } from "../envs";
import type { MailerSchema } from "../types";
import { Mailer } from "./base";

type Config = z.infer<typeof MailerSchema>;
const env = envs();

export function createResendMailer() {
  return new ResendMailer();
}

/**
 * A class representing a mailer using the Resend HTTP API.
 * @implements {Mailer}
 */
class ResendMailer extends Mailer {
  async sendEmail(config: Config) {
    const html = await this.render(config.template);
    const resend = new Resend(env.AUTH_RESEND_KEY);
    const result = await resend.emails.send({
      from: config.from,
      to: config.to,
      subject: config.subject,
      html,
    });
    if (result.error) {
      throw new Error(result.error.message);
    }
  }
}
