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
