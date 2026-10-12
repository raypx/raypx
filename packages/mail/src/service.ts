import { getMailEnv, type MailEnvironment } from "./env.js";
import type { Locale } from "@voidmix/i18n/types";
import {
  passwordResetEmail,
  verificationEmail,
  welcomeEmail,
  taskNotificationEmail,
} from "./templates/index.js";
import { createLoggerTransport, createResendTransport } from "./transports/index.js";
import type {
  MailAddress,
  Mailer,
  MailMessage,
  MailTemplateKind,
  MailTransport,
  EmailTemplateResult,
  SendWelcomeEmailInput,
  MissingMailConfiguration,
  ResolvedMailConfiguration,
} from "./types.js";

export type CreateMailerOptions = {
  env?: MailEnvironment;
  defaultLocale?: Locale;
  transport?: MailTransport;
  resolveConfiguration?: () => Promise<ResolvedMailConfiguration>;
  createResend?: (apiKey: string) => MailTransport;
  loggerTransport?: MailTransport;
};

export class MailUnavailableError extends Error {
  readonly code = "MAIL_NOT_CONFIGURED";

  constructor(public readonly missing: MissingMailConfiguration[]) {
    super("Mail configuration is not ready.");
    this.name = "MailUnavailableError";
  }
}

function address(email: string, name?: string | null): MailAddress {
  return { email, ...(name?.trim() ? { name: name.trim() } : {}) };
}

export function createMailer(options: CreateMailerOptions = {}): Mailer {
  const env = options.env ?? getMailEnv();
  const defaultLocale = options.defaultLocale ?? env.MAIL_DEFAULT_LOCALE;
  const resolveConfiguration =
    options.resolveConfiguration ?? (async () => configurationFromEnvironment(env));
  const createResend = options.createResend ?? ((apiKey) => createResendTransport({ apiKey }));
  const loggerTransport = options.loggerTransport ?? createLoggerTransport();

  async function deliver(
    template: MailTemplateKind,
    to: MailAddress,
    render: (configuration: ResolvedMailConfiguration) => Promise<EmailTemplateResult>,
    idempotencyKey?: string,
  ): Promise<void> {
    const configuration = await resolveConfiguration();
    const missing = missingConfiguration(configuration);
    if (!configuration.enabled || (env.NODE_ENV === "production" && missing.length > 0)) {
      throw new MailUnavailableError(missing);
    }

    const rendered = await render(configuration);
    const from = configuration.from ?? "noreply@voidmix.local";
    const message: MailMessage = {
      template,
      from: { email: from, name: configuration.fromName },
      to,
      ...rendered,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    };
    const transport =
      options.transport ??
      (configuration.resendApiKey ? createResend(configuration.resendApiKey) : loggerTransport);
    const result = await transport.send(message);
    if (!result.ok) throw new Error(`Failed to send ${template} email: ${result.error}`);
  }

  function sender<Input extends SendWelcomeEmailInput>(
    kind: MailTemplateKind,
    render: (input: Input, locale: Locale) => Promise<EmailTemplateResult>,
    urlKey: "baseUrl" | "appUrl",
  ) {
    return (input: Input) =>
      deliver(kind, address(input.email, input.name), (configuration) =>
        render(
          {
            ...input,
            ...(configuration.templatesBaseUrl ? { [urlKey]: configuration.templatesBaseUrl } : {}),
          },
          input.locale ?? defaultLocale,
        ),
      );
  }

  return {
    sendVerification: sender("email-verification", verificationEmail, "baseUrl"),
    sendPasswordReset: sender("password-reset", passwordResetEmail, "baseUrl"),
    sendWelcome: sender("welcome", welcomeEmail, "appUrl"),
    sendTaskNotification: (input) =>
      deliver(
        "task-notification",
        address(input.email, input.name),
        () => taskNotificationEmail(input, input.locale ?? defaultLocale),
        input.idempotencyKey,
      ),
  };
}

function configurationFromEnvironment(env: MailEnvironment): ResolvedMailConfiguration {
  return {
    enabled: true,
    from: env.MAIL_FROM,
    fromName: env.MAIL_FROM_NAME,
    templatesBaseUrl: env.EMAIL_TEMPLATES_BASE_URL ?? null,
    resendApiKey: env.RESEND_API_KEY ?? null,
  };
}

function missingConfiguration(
  configuration: ResolvedMailConfiguration,
): MissingMailConfiguration[] {
  const missing: MissingMailConfiguration[] = [];
  if (!configuration.resendApiKey) missing.push("RESEND_API_KEY");
  if (!configuration.from) missing.push("MAIL_FROM");
  return missing;
}
