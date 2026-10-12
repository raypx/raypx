export type { MailEnvironment } from "./env.js";
export { getMailEnv, mailEnv } from "./env.js";
export type { CreateMailerOptions } from "./service.js";
export { createMailer, MailUnavailableError } from "./service.js";
export * from "./templates/index.js";
export * from "./transports/index.js";
