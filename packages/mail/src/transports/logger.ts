import type { MailDeliveryRecorder, MailMessage, MailTransport } from "../types.js";
import { recordMailDelivery } from "./events.js";

export type LoggerTransportOptions = {
  record?: MailDeliveryRecorder;
};

function recipients(message: MailMessage): string | string[] {
  return Array.isArray(message.to) ? message.to.map(({ email }) => email) : message.to.email;
}

export function createLoggerTransport(options: LoggerTransportOptions = {}): MailTransport {
  const record = options.record ?? recordMailDelivery;

  return {
    async send(message) {
      record({
        recipient: recipients(message),
        template: message.template,
        transport: "logger",
        outcome: "logged",
      });
      return { ok: true, id: "logged" };
    },
  };
}
