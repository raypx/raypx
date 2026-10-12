import { Resend } from "resend";

import type {
  MailAddress,
  MailDeliveryRecorder,
  MailMessage,
  MailSendResult,
  MailTransport,
} from "../types.js";
import { recordMailDelivery } from "./events.js";

type ResendSendResult = {
  data: { id: string } | null;
  error: { message: string } | null;
};

export type ResendClient = {
  emails: {
    send(
      message: {
        from: string;
        to: string | string[];
        subject: string;
        html: string;
        text: string;
        replyTo?: string;
      },
      options?: { idempotencyKey: string },
    ): Promise<ResendSendResult>;
  };
};

export type ResendTransportOptions = {
  apiKey: string;
  client?: ResendClient;
  record?: MailDeliveryRecorder;
};

function formatAddress(address: MailAddress): string {
  return address.name ? `${address.name} <${address.email}>` : address.email;
}

function recipients(message: MailMessage): string | string[] {
  return Array.isArray(message.to) ? message.to.map(({ email }) => email) : message.to.email;
}

function failure(
  message: MailMessage,
  record: MailDeliveryRecorder,
  error: string,
): MailSendResult {
  record({
    recipient: recipients(message),
    template: message.template,
    transport: "resend",
    outcome: "failed",
  });
  return { ok: false, error };
}

export function createResendTransport(options: ResendTransportOptions): MailTransport {
  if (!options.apiKey.trim()) throw new Error("RESEND_API_KEY is required for Resend transport");
  const client = options.client ?? (new Resend(options.apiKey) as ResendClient);
  const record = options.record ?? recordMailDelivery;

  return {
    async send(message): Promise<MailSendResult> {
      try {
        const payload = {
          from: formatAddress(message.from),
          to: Array.isArray(message.to) ? message.to.map(formatAddress) : formatAddress(message.to),
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(message.replyTo ? { replyTo: formatAddress(message.replyTo) } : {}),
        };
        const { data, error } = await (message.idempotencyKey
          ? client.emails.send(payload, { idempotencyKey: message.idempotencyKey })
          : client.emails.send(payload));
        if (error) return failure(message, record, error.message);

        record({
          recipient: recipients(message),
          template: message.template,
          transport: "resend",
          outcome: "sent",
          ...(data?.id ? { messageId: data.id } : {}),
        });
        return { ok: true, ...(data?.id ? { id: data.id } : {}) };
      } catch (error) {
        return failure(
          message,
          record,
          error instanceof Error ? error.message : "Unknown Resend error",
        );
      }
    },
  };
}
