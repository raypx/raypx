import type { TerminalRequestSummary, ObservedProjection } from "@raypx/contracts/terminal";
import { type RelayClientFrame } from "@raypx/contracts/tasks";
import type { ControlRecord, ControlRepository } from "./repository.js";

import {
  ControlError,
  type Device,
  type ObservedSession,
  type ObservedRequest,
  type RelayActor,
  required,
  canonical,
} from "./records.js";
import type { ControlCredentials } from "./credentials.js";
export class ObservedProjectionStore {
  constructor(
    private readonly repository: ControlRepository,
    private readonly clock: () => number,
    private readonly credentials: ControlCredentials,
  ) {}
  private now() {
    return new Date(this.clock()).toISOString();
  }
  async observed(actor: RelayActor, frame: Extract<RelayClientFrame, { type: "observed" }>) {
    await this.credentials.withDevice(actor, async (tx, device) => {
      const state = device as Device & { observedEpoch?: string; observedRevision?: number };
      if (state.observedEpoch === frame.epoch && (state.observedRevision ?? 0) >= frame.revision)
        return;
      if (state.observedEpoch !== frame.epoch) {
        for (const request of await tx.list<ObservedRequest>("observed_request", device.id))
          if (request.status === "pending")
            await tx.put("observed_request", {
              ...request,
              status: "cancelled",
              serverCancelled: true,
            });
        state.observedEpoch = frame.epoch;
        state.observedRevision = 0;
      }
      for (const session of frame.sessions) {
        const old = await tx.get<ObservedSession>("observed_session", session.id);
        if (old && old.deviceId !== actor.deviceId) throw new ControlError("NOT_FOUND");
        if (
          old &&
          (old.provider !== session.provider ||
            old.providerSessionId !== session.providerSessionId ||
            old.projectId !== session.projectId)
        )
          throw new ControlError("EVENT_CONFLICT");
        await tx.put("observed_session", { ...session, deviceId: actor.deviceId });
      }
      for (const request of frame.requests) {
        const session = required(
          await tx.get<ObservedSession>("observed_session", request.sessionId),
        );
        if (
          session.deviceId !== actor.deviceId ||
          session.provider !== request.provider ||
          (request.status === "pending" && request.epoch !== frame.epoch)
        )
          throw new ControlError("INVALID_EVENT");
        const old = await tx.get<ObservedRequest>("observed_request", request.id);
        if (old && (old.deviceId !== actor.deviceId || old.sessionId !== request.sessionId))
          throw new ControlError("NOT_FOUND");
        if (
          old?.revision === request.revision &&
          !(old.status === "cancelled" && old.epoch !== frame.epoch && request.status !== "pending")
        ) {
          const { deviceId: _deviceId, serverCancelled: _cancelled, ...projection } = old;
          if (
            canonical(old.serverCancelled ? { ...projection, status: "pending" } : projection) !==
            canonical(request)
          )
            throw new ControlError("EVENT_CONFLICT");
        }
        // Only the host assigns request revisions. A server-side cancellation is a
        // projection fence and must never consume its next revision.
        const legacyCancellation =
          old?.status === "cancelled" && old.epoch !== frame.epoch && request.status !== "pending";
        if (
          !old ||
          old.revision < request.revision ||
          (legacyCancellation && old.revision === request.revision)
        )
          await tx.put("observed_request", { ...request, deviceId: actor.deviceId });
      }
      const history = await tx.list<ObservedRequest>("observed_request", device.id, {
        limit: 1000,
      });
      if (
        history.filter(
          (request) => request.status === "pending" && Date.parse(request.expiresAt) > this.clock(),
        ).length > 64
      )
        throw new ControlError("TOO_MANY_REQUESTS");
      const ended = history
        .filter(
          (request) =>
            request.status !== "pending" || Date.parse(request.expiresAt) <= this.clock(),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      for (const request of ended.slice(192)) await tx.remove("observed_request", request.id);
      const retained = new Set(
        history
          .filter(
            (request) =>
              request.status === "pending" && Date.parse(request.expiresAt) > this.clock(),
          )
          .concat(ended.slice(0, 192))
          .map((request) => request.sessionId),
      );
      for (const session of await tx.list<ObservedSession>("observed_session", device.id, {
        limit: 1000,
      }))
        if (!retained.has(session.id)) await tx.remove("observed_session", session.id);
      state.observedRevision = frame.revision;
    });
  }
  listObserved(userId: string): Promise<ObservedProjection> {
    return this.repository.read(userId, async (tx) => {
      const devices = new Map(
        (await tx.list<Device>("device"))
          .filter((value) => !value.revoked)
          .map((value) => [value.id, value]),
      );
      const requests = (
        await tx.list<TerminalRequestSummary & ControlRecord>("observed_request", undefined, {
          limit: 100,
          observedAt: this.now(),
          summary: true,
        })
      )
        .filter((value) => devices.has(value.deviceId))
        .map((value) =>
          value.status === "pending" && Date.parse(value.expiresAt) <= this.clock()
            ? { ...value, status: "expired" as const }
            : value,
        );
      const ids = new Set(requests.map((value) => value.sessionId));
      const sessions = (
        await tx.list<ObservedSession>("observed_session", undefined, { ids: [...ids], limit: 100 })
      )
        .filter((value) => devices.has(value.deviceId))
        .map((value) => ({ ...value, deviceName: devices.get(value.deviceId)!.name }));
      return { sessions, requests };
    });
  }
  getObserved(userId: string, id: string) {
    return this.repository.read(userId, async (tx) => {
      const request = required(await tx.get<ObservedRequest>("observed_request", id)),
        device = required(await tx.get<Device>("device", request.deviceId));
      if (device.revoked) throw new ControlError("NOT_FOUND");
      return request.status === "pending" && Date.parse(request.expiresAt) <= this.clock()
        ? { ...request, status: "expired" as const }
        : request;
    });
  }
}
