import type { AuthSession } from "@raypx/auth/types";
import type { HostAuthorization } from "@raypx/contracts/terminal";
import { type DeviceGrant } from "@raypx/contracts/tasks";
import type { ControlRepository, ControlTransaction, ControlReader } from "./repository.js";

import { ControlError, type Device, type RelayActor, required, hash } from "./records.js";
export class ControlCredentials {
  constructor(
    private readonly repository: ControlRepository,
    private readonly clock: () => number,
  ) {}
  private async issue(
    tx: ControlTransaction,
    auth: AuthSession,
    deviceId: string,
    epoch: number,
    role: "device" | "viewer",
  ) {
    const token = crypto.randomUUID() + crypto.randomUUID();
    const expiresAt = new Date(
      Math.min(
        this.clock() + (role === "device" ? 600_000 : 30_000),
        auth.session.expiresAt.getTime(),
      ),
    ).toISOString();
    for (const grant of await tx.list("grant", deviceId))
      if (Date.parse(grant.expiresAt) <= this.clock()) await tx.remove("grant", grant.id);
    await tx.put("grant", {
      id: await hash(token),
      deviceId,
      userId: auth.user.id,
      sessionId: auth.session.id,
      epoch,
      expiresAt,
      parentExpiresAt: auth.session.expiresAt.toISOString(),
      role,
    });
    return { token, expiresAt };
  }
  ticket(auth: AuthSession) {
    return this.repository.transaction(auth.user.id, (tx) =>
      this.issue(tx, auth, "viewer", 0, "viewer"),
    );
  }
  register(
    auth: AuthSession,
    input: {
      installationId: string;
      name: string;
      platform: string;
      appVersion: string;
      reconnect: boolean;
    },
  ): Promise<DeviceGrant> {
    return this.repository.transaction(auth.user.id, async (tx) => {
      let device = (await tx.list("device")).find(
        (value) => value.installationId === input.installationId,
      );
      if (device?.revoked && !input.reconnect) throw new ControlError("DEVICE_REVOKED");
      if (!device) {
        const id = crypto.randomUUID();
        device = {
          id,
          deviceId: id,
          installationId: input.installationId,
          name: input.name,
          platform: input.platform,
          appVersion: input.appVersion,
          epoch: 1,
          revoked: false,
          lastSeenAt: null,
          streamId: null,
          instanceId: null,
          connectionId: null,
          cursor: 0,
          initialized: false,
          capabilities: [],
        };
      } else if (device.revoked) {
        device.epoch++;
        device.revoked = false;
        device.lastSeenAt = null;
        device.streamId = null;
        device.cursor = 0;
      }
      Object.assign(device, {
        name: input.name,
        platform: input.platform,
        appVersion: input.appVersion,
      });
      await tx.put("device", device);
      return {
        deviceId: device.id,
        epoch: device.epoch,
        ...(await this.issue(tx, auth, device.id, device.epoch, "device")),
      };
    });
  }
  refreshGrant(auth: AuthSession, input: { deviceId: string; epoch: number }) {
    return this.repository.transaction(auth.user.id, async (tx) => {
      const device = required(await tx.get("device", input.deviceId));
      if (device.revoked || device.epoch !== input.epoch) throw new ControlError("DEVICE_REVOKED");
      return {
        deviceId: device.id,
        epoch: device.epoch,
        ...(await this.issue(tx, auth, device.id, device.epoch, "device")),
      };
    });
  }
  authorizeHost(
    auth: AuthSession,
    input: { deviceId: string; epoch: number },
  ): Promise<HostAuthorization> {
    return this.repository.transaction(auth.user.id, async (tx) => {
      const device = required(await tx.get("device", input.deviceId));
      if (device.revoked || device.epoch !== input.epoch) throw new ControlError("DEVICE_REVOKED");
      const age = auth.session.createdAt
        ? this.clock() - auth.session.createdAt.getTime()
        : Infinity;
      if (
        age < -30_000 ||
        age > 600_000 ||
        !(await tx.sessionActive(auth.session.id, new Date(this.clock())))
      )
        throw new ControlError("AUTH_REQUIRED");
      if (!(await tx.hostSessionAllowed(auth.session.createdAt!)))
        throw new ControlError("AUTH_REQUIRED");
      // Owner-scoped transactions serialize replacement. One current credential
      // per device cannot accumulate unusable keys when Keychain is unavailable.
      for (const item of await tx.list("credential", device.id))
        await tx.remove("credential", item.id);
      for (const grant of await tx.list("grant", device.id))
        if (grant.credentialId) await tx.remove("grant", grant.id);
      const credential = crypto.randomUUID() + crypto.randomUUID();
      const expiresAt = new Date(this.clock() + 30 * 86_400_000).toISOString();
      await tx.put("credential", {
        id: await hash(credential),
        securityVersion: await tx.securityVersion(),
        bootstrapSessionId: auth.session.id,
        userId: auth.user.id,
        deviceId: device.id,
        epoch: device.epoch,
        expiresAt,
      });
      return {
        accountId: auth.user.id,
        deviceId: device.id,
        epoch: device.epoch,
        credential,
        expiresAt,
      };
    });
  }
  async hostGrant(token: string) {
    const id = await hash(token),
      owner = await this.repository.findCredential(id);
    if (!owner) throw new ControlError("AUTH_REQUIRED");
    return this.repository.transaction(owner.userId, async (tx) => {
      const credential = await tx.get("credential", id);
      if (
        !credential ||
        !credential.bootstrapSessionId ||
        Date.parse(credential.expiresAt) <= this.clock() ||
        credential.securityVersion !== (await tx.securityVersion())
      )
        throw new ControlError("AUTH_REQUIRED");
      const device = required(await tx.get("device", credential.deviceId));
      if (device.revoked || device.epoch !== credential.epoch)
        throw new ControlError("DEVICE_REVOKED");
      const value = crypto.randomUUID() + crypto.randomUUID(),
        expiresAt = new Date(
          Math.min(this.clock() + 600_000, Date.parse(credential.expiresAt)),
        ).toISOString();
      for (const grant of await tx.list("grant", device.id))
        if (Date.parse(grant.expiresAt) <= this.clock()) await tx.remove("grant", grant.id);
      await tx.put("grant", {
        id: await hash(value),
        deviceId: device.id,
        userId: owner.userId,
        sessionId: "",
        credentialId: credential.id,
        epoch: device.epoch,
        expiresAt,
        parentExpiresAt: credential.expiresAt,
        role: "device",
      });
      return {
        accountId: owner.userId,
        grant: { deviceId: device.id, epoch: device.epoch, token: value, expiresAt },
      };
    });
  }
  async revokeHost(token: string) {
    const id = await hash(token),
      owner = await this.repository.findCredential(id);
    if (owner)
      await this.repository.transaction(owner.userId, async (tx) => {
        const credential = await tx.get("credential", id);
        if (!credential) return;
        for (const item of await tx.list("credential", credential.deviceId))
          await tx.remove("credential", item.id);
        for (const grant of await tx.list("grant", credential.deviceId))
          await tx.remove("grant", grant.id);
        const device = await tx.get("device", credential.deviceId);
        if (device) {
          device.lastSeenAt = null;
          device.connectionId = null;
          await tx.put("device", device);
        }
        for (const request of await tx.list("observed_request", credential.deviceId))
          if (request.status === "pending")
            await tx.put("observed_request", {
              ...request,
              status: "cancelled",
              serverCancelled: true,
            });
      });
    return { revoked: true as const };
  }
  revokeHostAuthorizations(userId: string, sessionId?: string) {
    return this.repository.transaction(userId, async (tx) => {
      if (!sessionId) await tx.revokeHostSecurity();
      const credentials = (await tx.list("credential")).filter(
        (credential) => !sessionId || credential.bootstrapSessionId === sessionId,
      );
      const ids = new Set(credentials.map((credential) => credential.id));
      const devices = new Set(credentials.map((credential) => credential.deviceId));
      for (const credential of credentials) await tx.remove("credential", credential.id);
      for (const grant of await tx.list("grant"))
        if (grant.credentialId && (!sessionId || ids.has(grant.credentialId)))
          await tx.remove("grant", grant.id);
      for (const request of await tx.list("observed_request"))
        if (request.status === "pending" && (!sessionId || devices.has(request.deviceId)))
          await tx.put("observed_request", {
            ...request,
            status: "cancelled",
            serverCancelled: true,
          });
    });
  }
  private async authorized(tx: ControlReader, sessionId: string, credentialId?: string) {
    if (!credentialId) return tx.sessionActive(sessionId, new Date(this.clock()));
    const credential = await tx.get("credential", credentialId);
    return Boolean(
      credential &&
      credential.bootstrapSessionId &&
      Date.parse(credential.expiresAt) > this.clock() &&
      credential.securityVersion === (await tx.securityVersion()),
    );
  }
  async authenticate(
    role: RelayActor["role"],
    token: string,
    connectionId: string,
  ): Promise<RelayActor> {
    const grantId = await hash(token),
      owner = await this.repository.findGrant(grantId);
    if (!owner) throw new ControlError("AUTH_REQUIRED");
    return this.repository.transaction(owner.userId, async (tx) => {
      const grant = await tx.get("grant", grantId);
      if (
        !grant ||
        grant.role !== role ||
        Date.parse(grant.expiresAt) <= this.clock() ||
        !(await this.authorized(tx, grant.sessionId, grant.credentialId))
      )
        throw new ControlError("AUTH_REQUIRED");
      if (role === "device") {
        const device = required(await tx.get("device", grant.deviceId));
        if (device.revoked || device.epoch !== grant.epoch)
          throw new ControlError("DEVICE_REVOKED");
      } else await tx.remove("grant", grantId);
      return {
        role,
        userId: owner.userId,
        deviceId: grant.deviceId,
        epoch: grant.epoch,
        sessionId: grant.sessionId,
        grantId,
        expiresAt: role === "viewer" ? grant.parentExpiresAt : grant.expiresAt,
        connectionId,
        ...(grant.credentialId ? { credentialId: grant.credentialId } : {}),
      };
    });
  }
  async check(tx: ControlReader, actor: RelayActor) {
    if (
      Date.parse(actor.expiresAt) <= this.clock() ||
      !(await this.authorized(tx, actor.sessionId, actor.credentialId))
    )
      throw new ControlError("AUTH_REQUIRED");
    if (actor.role === "device") {
      const device = required(await tx.get("device", actor.deviceId));
      if (device.revoked || device.epoch !== actor.epoch) throw new ControlError("DEVICE_REVOKED");
      if (!(await tx.get("grant", actor.grantId))) throw new ControlError("AUTH_REQUIRED");
    }
  }
  validate(actor: RelayActor) {
    return this.repository.read(actor.userId, (tx) => this.check(tx, actor));
  }
  withDevice(
    actor: RelayActor,
    run: (tx: ControlTransaction, device: Device) => Promise<void>,
    fence = true,
  ) {
    if (actor.role !== "device") throw new ControlError("FORBIDDEN");
    return this.repository.deviceTransaction(actor.userId, actor.deviceId, async (tx) => {
      await this.check(tx, actor);
      const device = required(await tx.get("device", actor.deviceId));
      if (fence && device.connectionId !== actor.connectionId)
        throw new ControlError("DEVICE_REPLACED");
      await run(tx, device);
      await tx.put("device", device);
    });
  }
  listDevices(userId: string) {
    return this.repository.read(userId, async (tx) =>
      Promise.all(
        (await tx.list("device")).map(async (device) => ({
          id: device.id,
          name: device.name,
          platform: device.platform,
          appVersion: device.appVersion,
          epoch: device.epoch,
          revoked: device.revoked,
          lastSeenAt: device.lastSeenAt,
          online:
            !device.revoked &&
            device.lastSeenAt !== null &&
            this.clock() - Date.parse(device.lastSeenAt) < 45_000,
          capabilities: device.capabilities,
          projects: (await tx.list("project", device.id)).map((project) => ({
            id: project.projectId,
            name: project.name,
            providers: project.providers,
            dirty: project.dirty,
          })),
        })),
      ),
    );
  }
  revoke(userId: string, input: { deviceId: string; epoch: number }) {
    return this.repository.transaction(userId, async (tx) => {
      const device = required(await tx.get("device", input.deviceId));
      if (device.epoch !== input.epoch) throw new ControlError("DEVICE_REVOKED");
      device.revoked = true;
      device.lastSeenAt = null;
      await tx.put("device", device);
      for (const grant of await tx.list("grant", device.id)) await tx.remove("grant", grant.id);
      for (const credential of await tx.list("credential", device.id))
        await tx.remove("credential", credential.id);
      await tx.purgeObserved(device.id);
      return { revoked: true as const };
    });
  }
}
