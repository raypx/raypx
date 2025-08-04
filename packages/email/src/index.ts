import * as nodemailer from "nodemailer"
import { Resend } from "resend"
import { envs } from "./envs"

const env = envs()

export const resend = new Resend(env.RESEND_TOKEN)

export const transporter = nodemailer.createTransport({
  host: env.MAIL_HOST,
  port: env.MAIL_PORT,
  secure: env.MAIL_SECURE,
  auth: {
    user: env.MAIL_USER,
    pass: env.MAIL_PASSWORD,
  },
})

const defaultFrom = "Raypx <hello@raypx.com>"

interface SendEmailOptions {
  to: string
  subject: string
  text: string
  provider?: "resend" | "nodemailer"
}

export const sendEmail = async (
  options: SendEmailOptions,
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (options.provider === "resend") {
      await resend.emails.send({
        from: defaultFrom,
        to: options.to,
        subject: options.subject,
        text: options.text,
      })
    } else {
      await transporter.sendMail({
        from: defaultFrom,
        to: options.to,
        subject: options.subject,
        text: options.text,
      })
    }

    return { success: true }
  } catch (error) {
    console.error("Failed to send email:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}
