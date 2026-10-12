import type { AuditEvent } from "@voidmix/core";
import { auditEvents } from "./schema.js";

export function toAuditInsert(event: AuditEvent): typeof auditEvents.$inferInsert {
  return {
    id: event.id,
    actorId: event.actorId,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    occurredAt: event.occurredAt,
    metadata: event.metadata,
  };
}
