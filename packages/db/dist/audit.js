"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toAuditInsert = toAuditInsert;
function toAuditInsert(event) {
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
//# sourceMappingURL=audit.js.map