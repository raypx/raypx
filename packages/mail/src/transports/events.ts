import { logger } from "@voidmix/shared/logger";

import type { MailDeliveryRecorder } from "../types.js";

export const recordMailDelivery: MailDeliveryRecorder = (event) => {
  const log = logger({
    operation: "mail.delivery",
    recipientCount: Array.isArray(event.recipient) ? event.recipient.length : 1,
    template: event.template,
    transport: event.transport,
    outcome: event.outcome,
    ...(event.messageId ? { messageId: event.messageId } : {}),
  });
  if (event.outcome === "failed") log.error("Mail delivery failed");
  else log.info("Mail delivery completed");
  log.emit();
};
