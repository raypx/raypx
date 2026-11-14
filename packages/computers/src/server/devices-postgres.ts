import { and, eq, gt, isNull, or, asc, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  deviceComputers as devices,
  deviceComputerPairings as pairings,
  deviceSpaceDevices as links,
  deviceDirectoryGrants as grants,
  deviceComputerSelections as selections,
  deviceConnectorOperations as operations,
  deviceConnectorEvents as connectorEvents,
  computers,
  spaceMembers,
  spaces,
  user,
  conversations,
  conversationRuns as runs,
  conversationRunSteering as steering,
  conversationMessages as messages,
  spaceAudit,
} from "@raypx/database/schema";
import { deviceComputerSchema, type DeviceComputerSelection } from "@raypx/core/computers";
import type { SpaceScope } from "@raypx/spaces/server";
import {
  DeviceComputerError,
  type DeviceComputersRepository,
  type ConnectorIdentity,
  type DeviceRunContext,
  type DeviceRunGrant,
} from "../devices.js";
import type { DeviceDirectoryGrantWire } from "@raypx/contracts/device-connector";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Connection = Database | Tx;
const token = () =>
  crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
export async function deviceDigest(value: string): Promise<string> {
  return Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  ).toString("hex");
}
function wire(row: typeof grants.$inferSelect): DeviceDirectoryGrantWire {
  return {
    id: row.id,
    spaceId: row.spaceId,
    deviceId: row.deviceId,
    directory: row.directory,
    revision: row.revision,
  };
}
async function membership(db: Connection, spaceId: string, accountId: string) {
  const [row] = await db
    .select({ member: spaceMembers, space: spaces })
    .from(spaceMembers)
    .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
    .where(
      and(
        eq(spaceMembers.spaceId, spaceId),
        eq(spaceMembers.accountId, accountId),
        isNull(spaceMembers.removedAt),
        isNull(spaces.deletionClaimedAt),
      ),
    );
  if (!row) throw new DeviceComputerError("ACCESS_DENIED");
  return row;
}
async function audit(
  db: Tx,
  spaceId: string,
  accountId: string,
  action: string,
  targetId: string,
  operationId: string = crypto.randomUUID(),
) {
  await db.insert(spaceAudit).values({
    spaceId,
    id: crypto.randomUUID(),
    operationId,
    actorAccountId: accountId,
    action,
    targetId,
    outcome: "succeeded",
  });
}
async function deviceLock(db: Tx, id: string) {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${"device-computer:" + id}, 0))`,
  );
}
/** Every use refreshes membership and the exact Run lease. No selector conveys access. */
export function createDeviceComputersRepository(
  db: Database,
  origin: string,
  now = () => new Date(),
): DeviceComputersRepository {
  const originMatch = eq(devices.origin, origin);
  async function ownedDevice(connection: Connection, identity: ConnectorIdentity) {
    const [row] = await connection
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.id, identity.deviceId),
          eq(devices.accountId, identity.accountId),
          originMatch,
          isNull(devices.revokedAt),
        ),
      );
    if (!row) throw new DeviceComputerError("DEVICE_REVOKED");
    return row;
  }
  async function owned(scope: SpaceScope, deviceId: string) {
    const { space } = await membership(db, scope.spaceId, scope.member.accountId);
    const [row] = await db
      .select({ device: devices })
      .from(links)
      .innerJoin(devices, eq(devices.id, links.deviceId))
      .where(
        and(
          eq(links.spaceId, scope.spaceId),
          eq(links.deviceId, deviceId),
          eq(links.accountId, scope.member.accountId),
          eq(devices.accountId, scope.member.accountId),
          originMatch,
          isNull(devices.revokedAt),
        ),
      );
    if (!row) throw new DeviceComputerError("NOT_FOUND");
    return {
      deviceId,
      accountId: row.device.accountId,
      credentialRevision: row.device.credentialRevision,
      spaceLabel: space.name,
    };
  }
  async function activeGrants(connection: Connection, identity: ConnectorIdentity) {
    await ownedDevice(connection, identity);
    const rows = await connection
      .select({ grant: grants })
      .from(grants)
      .innerJoin(
        spaceMembers,
        and(eq(spaceMembers.spaceId, grants.spaceId), eq(spaceMembers.accountId, grants.accountId)),
      )
      .innerJoin(spaces, eq(spaces.id, grants.spaceId))
      .where(
        and(
          eq(grants.deviceId, identity.deviceId),
          eq(grants.accountId, identity.accountId),
          isNull(grants.revokedAt),
          isNull(spaceMembers.removedAt),
          isNull(spaces.deletionClaimedAt),
        ),
      )
      .orderBy(asc(grants.createdAt))
      .limit(256);
    return rows.map(({ grant }) => wire(grant));
  }
  async function admitted(
    connection: Connection,
    context: DeviceRunContext,
  ): Promise<DeviceRunGrant> {
    await membership(connection, context.spaceId, context.requesterAccountId);
    const [row] = await connection
      .select({ grant: grants, device: devices, computer: computers })
      .from(grants)
      .innerJoin(
        devices,
        and(eq(devices.id, grants.deviceId), eq(devices.accountId, grants.accountId)),
      )
      .innerJoin(computers, and(eq(computers.spaceId, grants.spaceId), eq(computers.id, grants.id)))
      .where(
        and(
          eq(grants.spaceId, context.spaceId),
          eq(grants.id, context.grantId),
          eq(grants.deviceId, context.deviceId),
          eq(grants.accountId, context.requesterAccountId),
          isNull(grants.revokedAt),
          originMatch,
          isNull(devices.revokedAt),
        ),
      );
    if (!row || row.computer.scope !== "device" || row.computer.provider !== "device")
      throw new DeviceComputerError("ACCESS_DENIED");
    let runId: string | null = context.runId;
    let depth = 0;
    while (runId) {
      const [run] = await connection
        .select()
        .from(runs)
        .where(
          and(
            eq(runs.spaceId, context.spaceId),
            eq(runs.conversationId, context.conversationId),
            eq(runs.id, runId),
          ),
        );
      if (
        !run ||
        run.memberAccountId !== context.requesterAccountId ||
        run.inboundProvenance ||
        !["message", "routine", "delegation"].includes(run.trigger)
      )
        throw new DeviceComputerError("ACCESS_DENIED");
      if (
        runId === context.runId &&
        (run.fence !== context.runFence ||
          !run.leaseOwner ||
          !run.leaseExpiresAt ||
          run.leaseExpiresAt <= now() ||
          !["running", "waiting"].includes(run.state))
      )
        throw new DeviceComputerError("STALE_FENCE");
      const [foreignSteer] = await connection
        .select({ id: steering.messageId })
        .from(steering)
        .innerJoin(
          messages,
          and(
            eq(messages.spaceId, steering.spaceId),
            eq(messages.conversationId, steering.conversationId),
            eq(messages.id, steering.messageId),
          ),
        )
        .where(
          and(
            eq(steering.spaceId, context.spaceId),
            eq(steering.conversationId, context.conversationId),
            eq(steering.runId, runId),
            sql`${messages.authorAccountId} is distinct from ${context.requesterAccountId}`,
          ),
        )
        .limit(1);
      if (foreignSteer) throw new DeviceComputerError("ACCESS_DENIED");
      runId = run.parentRunId;
      depth += 1;
      if (depth > 4) throw new DeviceComputerError("ACCESS_DENIED");
    }
    if (
      !row.device.connectionOwner ||
      !row.device.connectionExpiresAt ||
      row.device.connectionExpiresAt <= now()
    )
      throw new DeviceComputerError("DEVICE_OFFLINE");
    return {
      ...wire(row.grant),
      name: row.device.name,
      generation: row.computer.generation,
      connectionFence: row.device.connectionFence,
      connectionOwner: row.device.connectionOwner ?? "",
    };
  }
  const repository: DeviceComputersRepository = {
    owned,
    async list(scope) {
      await membership(db, scope.spaceId, scope.member.accountId);
      const rows = await db
        .select({ device: devices })
        .from(links)
        .innerJoin(devices, eq(devices.id, links.deviceId))
        .where(
          and(
            eq(links.spaceId, scope.spaceId),
            eq(links.accountId, scope.member.accountId),
            originMatch,
          ),
        )
        .orderBy(asc(devices.createdAt))
        .limit(100);
      const grantRows = await db
        .select()
        .from(grants)
        .where(and(eq(grants.spaceId, scope.spaceId), eq(grants.accountId, scope.member.accountId)))
        .orderBy(asc(grants.createdAt))
        .limit(1000);
      return rows.map(({ device }) => {
        const connected =
          !device.revokedAt &&
          Boolean(
            device.connectionOwner &&
            device.connectionExpiresAt &&
            device.connectionExpiresAt > now(),
          );
        let connectionState: "revoked" | "connected" | "offline" = "offline";
        if (device.revokedAt) connectionState = "revoked";
        else if (connected) connectionState = "connected";
        return deviceComputerSchema.parse({
          id: device.id,
          name: device.name,
          platform: device.platform,
          connected,
          connectionState,
          createdAt: device.createdAt.toISOString(),
          grants: grantRows
            .filter((grant) => grant.deviceId === device.id)
            .slice(0, 100)
            .map((grant) => ({
              id: grant.id,
              spaceId: grant.spaceId,
              directory: grant.directory,
              revision: grant.revision,
              revokedAt: grant.revokedAt?.toISOString() ?? null,
            })),
        });
      });
    },
    async createPairing(scope) {
      if (!origin) throw new DeviceComputerError("ACCESS_DENIED");
      const code = token().slice(0, 12).toUpperCase();
      const expiresAt = new Date(now().getTime() + 300_000);
      await db.transaction(async (tx) => {
        await membership(tx, scope.spaceId, scope.member.accountId);
        await tx.insert(pairings).values({
          id: crypto.randomUUID(),
          spaceId: scope.spaceId,
          accountId: scope.member.accountId,
          codeHash: await deviceDigest(code),
          expiresAt,
        });
        await audit(
          tx,
          scope.spaceId,
          scope.member.accountId,
          "device.pairing.created",
          scope.member.accountId,
        );
      });
      return { code, expiresAt: expiresAt.toISOString() };
    },
    async claim(input) {
      if (!origin) throw new DeviceComputerError("ACCESS_DENIED");
      const hash = await deviceDigest(input.code.toUpperCase().replaceAll("-", ""));
      const claimToken = token();
      return db.transaction(async (tx) => {
        const [pair] = await tx
          .select()
          .from(pairings)
          .where(eq(pairings.codeHash, hash))
          .for("update");
        if (!pair || pair.expiresAt <= now()) throw new DeviceComputerError("PAIRING_EXPIRED");
        if (pair.consumedAt || pair.claimTokenHash) throw new DeviceComputerError("PAIRING_USED");
        const { space } = await membership(tx, pair.spaceId, pair.accountId);
        const [account] = await tx
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, pair.accountId));
        if (!account) throw new DeviceComputerError("ACCESS_DENIED");
        await tx
          .update(pairings)
          .set({
            claimTokenHash: await deviceDigest(claimToken),
            deviceName: input.deviceName,
            platform: input.platform ?? "unknown",
          })
          .where(and(eq(pairings.spaceId, pair.spaceId), eq(pairings.id, pair.id)));
        return {
          claimId: pair.id,
          claimToken,
          accountId: pair.accountId,
          accountLabel: account.name,
          spaceId: pair.spaceId,
          spaceLabel: space.name,
          expiresAt: pair.expiresAt.toISOString(),
        };
      });
    },
    async confirm(input) {
      if (!origin) throw new DeviceComputerError("ACCESS_DENIED");
      const credential = token();
      return db.transaction(async (tx) => {
        const [pair] = await tx
          .select()
          .from(pairings)
          .where(
            and(
              eq(pairings.id, input.claimId),
              eq(pairings.claimTokenHash, await deviceDigest(input.claimToken)),
            ),
          )
          .for("update");
        if (!pair || pair.expiresAt <= now()) throw new DeviceComputerError("PAIRING_EXPIRED");
        if (pair.consumedAt) throw new DeviceComputerError("PAIRING_USED");
        await membership(tx, pair.spaceId, pair.accountId);
        const id = crypto.randomUUID();
        await tx.insert(devices).values({
          id,
          accountId: pair.accountId,
          origin,
          name: pair.deviceName!,
          platform: pair.platform!,
          credentialHash: await deviceDigest(credential),
        });
        await tx
          .insert(links)
          .values({ spaceId: pair.spaceId, deviceId: id, accountId: pair.accountId });
        await tx
          .update(pairings)
          .set({ consumedAt: now() })
          .where(and(eq(pairings.spaceId, pair.spaceId), eq(pairings.id, pair.id)));
        await audit(tx, pair.spaceId, pair.accountId, "device.paired", id);
        return {
          protocolVersion: 1,
          deviceId: id,
          deviceName: pair.deviceName!,
          accountId: pair.accountId,
          credential,
          credentialRevision: 1,
        };
      });
    },
    async prepareGrant(identity, spaceId, directory) {
      const device = await ownedDevice(db, identity);
      const { space } = await membership(db, spaceId, identity.accountId);
      const [account] = await db
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, identity.accountId));
      if (!account) throw new DeviceComputerError("ACCESS_DENIED");
      return {
        accountId: identity.accountId,
        accountLabel: account.name,
        spaceId,
        spaceLabel: space.name,
        deviceId: device.id,
        deviceName: device.name,
        directory,
      };
    },
    async revokeAccount(accountId) {
      const rows = await db
        .select()
        .from(devices)
        .where(and(eq(devices.accountId, accountId), originMatch, isNull(devices.revokedAt)));
      for (const row of rows)
        await repository.revoke({
          deviceId: row.id,
          accountId,
          credentialRevision: row.credentialRevision,
        });
    },
    async route(identity) {
      const row = await ownedDevice(db, identity);
      return { owner: row.connectionOwner ?? "", fence: row.connectionFence };
    },
    async authenticate(credential) {
      if (!origin) throw new DeviceComputerError("ACCESS_DENIED");
      const hash = await deviceDigest(credential);
      const [row] = await db
        .select()
        .from(devices)
        .where(
          and(
            originMatch,
            isNull(devices.revokedAt),
            or(eq(devices.credentialHash, hash), eq(devices.previousCredentialHash, hash)),
          ),
        );
      if (!row) throw new DeviceComputerError("ACCESS_DENIED");
      return {
        deviceId: row.id,
        accountId: row.accountId,
        credentialRevision: row.credentialRevision,
        presentedCredentialHash: hash,
      };
    },
    async connect(identity, owner) {
      const credential = token();
      return db.transaction(async (tx) => {
        await deviceLock(tx, identity.deviceId);
        const row = await ownedDevice(tx, identity);
        if (row.credentialRevision !== identity.credentialRevision)
          throw new DeviceComputerError("STALE_FENCE");
        const revision = row.credentialRevision + 1;
        const fence = row.connectionFence + 1;
        await tx
          .update(devices)
          .set({
            credentialHash: await deviceDigest(credential),
            previousCredentialHash: identity.presentedCredentialHash ?? row.credentialHash,
            credentialRevision: revision,
            connectionFence: fence,
            connectionOwner: owner,
            connectionExpiresAt: new Date(now().getTime() + 15_000),
            updatedAt: now(),
          })
          .where(eq(devices.id, row.id));
        return {
          deviceId: row.id,
          accountId: row.accountId,
          credentialRevision: revision,
          connectionFence: fence,
          cursor: row.cursor,
          credential: {
            protocolVersion: 1,
            deviceId: row.id,
            deviceName: row.name,
            accountId: row.accountId,
            credential,
            credentialRevision: revision,
          },
          grants: await activeGrants(tx, identity),
        };
      });
    },
    async ready(device, owner) {
      const result = await db
        .update(devices)
        .set({ previousCredentialHash: null })
        .where(
          and(
            eq(devices.id, device.deviceId),
            eq(devices.connectionOwner, owner),
            eq(devices.connectionFence, device.connectionFence),
            isNull(devices.revokedAt),
            gt(devices.connectionExpiresAt, now()),
          ),
        )
        .returning({ id: devices.id });
      if (!result.length) throw new DeviceComputerError("STALE_FENCE");
    },
    async heartbeat(device, owner) {
      const result = await db
        .update(devices)
        .set({ connectionExpiresAt: new Date(now().getTime() + 15_000), updatedAt: now() })
        .where(
          and(
            eq(devices.id, device.deviceId),
            eq(devices.connectionOwner, owner),
            eq(devices.connectionFence, device.connectionFence),
            isNull(devices.revokedAt),
            gt(devices.connectionExpiresAt, now()),
          ),
        )
        .returning({ id: devices.id });
      if (!result.length) throw new DeviceComputerError("DEVICE_REVOKED");
    },
    async disconnect(device, owner) {
      await db
        .update(devices)
        .set({ connectionOwner: null, connectionExpiresAt: null, updatedAt: now() })
        .where(
          and(
            eq(devices.id, device.deviceId),
            eq(devices.connectionOwner, owner),
            eq(devices.connectionFence, device.connectionFence),
          ),
        );
    },
    grants: (identity) => activeGrants(db, identity),
    async grant(identity, input) {
      if (!input.directory.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(input.directory))
        throw new DeviceComputerError("INVALID_INPUT");
      return db.transaction(async (tx) => {
        await deviceLock(tx, identity.deviceId);
        await ownedDevice(tx, identity);
        await membership(tx, input.spaceId, identity.accountId);
        const [countRow] = await tx
          .select({ value: sql<number>`count(*)::int` })
          .from(grants)
          .where(
            and(
              eq(grants.spaceId, input.spaceId),
              eq(grants.deviceId, identity.deviceId),
              isNull(grants.revokedAt),
            ),
          );
        if ((countRow?.value ?? 0) >= 100) throw new DeviceComputerError("LIMIT_EXCEEDED");
        await tx
          .insert(links)
          .values({
            spaceId: input.spaceId,
            deviceId: identity.deviceId,
            accountId: identity.accountId,
          })
          .onConflictDoNothing();
        const id = crypto.randomUUID();
        await tx.insert(computers).values({
          spaceId: input.spaceId,
          id,
          scope: "device",
          provider: "device",
          createdByAccountId: identity.accountId,
          state: "running",
        });
        const [row] = await tx
          .insert(grants)
          .values({
            spaceId: input.spaceId,
            id,
            deviceId: identity.deviceId,
            accountId: identity.accountId,
            directory: input.directory,
          })
          .returning();
        await audit(tx, input.spaceId, identity.accountId, "device.directory.granted", id);
        return wire(row!);
      });
    },
    async revokeGrant(identity, spaceId, grantId) {
      await db.transaction(async (tx) => {
        await deviceLock(tx, identity.deviceId);
        await membership(tx, spaceId, identity.accountId);
        const [grant] = await tx
          .update(grants)
          .set({ revokedAt: now(), revision: sql`${grants.revision}+1` })
          .where(
            and(
              eq(grants.spaceId, spaceId),
              eq(grants.id, grantId),
              eq(grants.deviceId, identity.deviceId),
              eq(grants.accountId, identity.accountId),
              isNull(grants.revokedAt),
            ),
          )
          .returning();
        if (!grant) throw new DeviceComputerError("NOT_FOUND");
        await tx
          .update(computers)
          .set({ state: "destroyed", generation: sql`${computers.generation}+1`, updatedAt: now() })
          .where(and(eq(computers.spaceId, spaceId), eq(computers.id, grantId)));

        await audit(tx, spaceId, identity.accountId, "device.directory.revoked", grantId);
      });
    },
    async revoke(identity) {
      await db.transaction(async (tx) => {
        await deviceLock(tx, identity.deviceId);
        const row = await ownedDevice(tx, identity);
        const ownedLinks = await tx
          .select()
          .from(links)
          .where(and(eq(links.deviceId, row.id), eq(links.accountId, row.accountId)));
        await tx
          .update(devices)
          .set({
            revokedAt: now(),
            credentialHash: await deviceDigest(token()),
            previousCredentialHash: null,
            connectionOwner: null,
            connectionExpiresAt: null,
            connectionFence: sql`${devices.connectionFence}+1`,
            updatedAt: now(),
          })
          .where(eq(devices.id, row.id));
        await tx
          .update(grants)
          .set({ revokedAt: now(), revision: sql`${grants.revision}+1` })
          .where(and(eq(grants.deviceId, row.id), isNull(grants.revokedAt)));

        for (const link of ownedLinks)
          await audit(tx, link.spaceId, row.accountId, "device.revoked", row.id);
      });
    },
    async getSelection(scope, conversationId) {
      await membership(db, scope.spaceId, scope.member.accountId);
      const [conversation] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.spaceId, scope.spaceId), eq(conversations.id, conversationId)));
      if (!conversation) throw new DeviceComputerError("NOT_FOUND");
      const [row] = await db
        .select()
        .from(selections)
        .where(
          and(
            eq(selections.spaceId, scope.spaceId),
            eq(selections.conversationId, conversationId),
            eq(selections.accountId, scope.member.accountId),
          ),
        );
      return row ? { deviceId: row.deviceId, grantId: row.grantId } : null;
    },
    async select(scope, conversationId, selection: DeviceComputerSelection | null) {
      await membership(db, scope.spaceId, scope.member.accountId);
      const [conversation] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.spaceId, scope.spaceId), eq(conversations.id, conversationId)));
      if (!conversation) throw new DeviceComputerError("NOT_FOUND");
      await db.transaction(async (tx) => {
        if (selection) {
          await owned(scope, selection.deviceId);
          const [row] = await tx
            .select()
            .from(grants)
            .where(
              and(
                eq(grants.spaceId, scope.spaceId),
                eq(grants.id, selection.grantId),
                eq(grants.deviceId, selection.deviceId),
                eq(grants.accountId, scope.member.accountId),
                isNull(grants.revokedAt),
              ),
            );
          if (!row) throw new DeviceComputerError("NOT_FOUND");
          await tx
            .insert(selections)
            .values({
              spaceId: scope.spaceId,
              conversationId,
              accountId: scope.member.accountId,
              ...selection,
            })
            .onConflictDoUpdate({
              target: [selections.spaceId, selections.conversationId, selections.accountId],
              set: selection,
            });
        } else
          await tx
            .delete(selections)
            .where(
              and(
                eq(selections.spaceId, scope.spaceId),
                eq(selections.conversationId, conversationId),
                eq(selections.accountId, scope.member.accountId),
              ),
            );
      });
      return selection;
    },
    async resolveRun(scope, run) {
      let grantId = run.computerId;
      if (!grantId) {
        if (run.startedAt) return null;
        const [selection] = await db
          .select()
          .from(selections)
          .where(
            and(
              eq(selections.spaceId, scope.spaceId),
              eq(selections.conversationId, run.conversationId),
              eq(selections.accountId, run.memberAccountId),
            ),
          );
        if (!selection) return null;
        if (run.untrustedInput || run.inboundProvenance)
          throw new DeviceComputerError("ACCESS_DENIED");
        grantId = selection.grantId;
      }
      const [row] = await db
        .select({ grant: grants, computer: computers, device: devices })
        .from(grants)
        .innerJoin(
          computers,
          and(eq(computers.spaceId, grants.spaceId), eq(computers.id, grants.id)),
        )
        .innerJoin(devices, eq(devices.id, grants.deviceId))
        .where(and(eq(grants.spaceId, scope.spaceId), eq(grants.id, grantId), originMatch));
      if (!row) {
        if (run.computerId) return null;
        throw new DeviceComputerError("NOT_FOUND");
      }
      if (row.computer.scope !== "device" || row.computer.provider !== "device")
        throw new DeviceComputerError("ACCESS_DENIED");
      if (run.startedAt === null && (run.untrustedInput || run.inboundProvenance))
        throw new DeviceComputerError("ACCESS_DENIED");
      if (
        row.grant.accountId !== run.memberAccountId ||
        row.grant.accountId !== scope.member.accountId ||
        row.grant.revokedAt ||
        row.device.revokedAt
      )
        throw new DeviceComputerError("ACCESS_DENIED");
      return {
        ...wire(row.grant),
        name: row.device.name,
        generation: row.computer.generation,
        connectionFence: row.device.connectionFence,
        connectionOwner: row.device.connectionOwner ?? "",
      };
    },
    admit: (context) => admitted(db, context),
    async operationEvents(context, operationId, after) {
      await membership(db, context.spaceId, context.requesterAccountId);
      const rows = await db
        .select({ sequence: connectorEvents.sequence, event: connectorEvents.event })
        .from(connectorEvents)
        .where(
          and(
            eq(connectorEvents.spaceId, context.spaceId),
            eq(connectorEvents.deviceId, context.deviceId),
            eq(connectorEvents.operationId, operationId),
            gt(connectorEvents.sequence, after),
          ),
        )
        .orderBy(asc(connectorEvents.sequence))
        .limit(128);
      return rows as {
        sequence: number;
        event: import("@raypx/contracts/device-connector").DeviceConnectorEventData;
      }[];
    },
    async beginOperation(context, request) {
      await db.transaction(async (tx) => {
        await deviceLock(tx, context.deviceId);
        const grant = await admitted(tx, context);
        if (
          request.deviceId !== context.deviceId ||
          request.spaceId !== context.spaceId ||
          request.grantId !== context.grantId ||
          request.accountId !== context.requesterAccountId ||
          request.requesterAccountId !== context.requesterAccountId ||
          request.runId !== context.runId ||
          request.runFence !== context.runFence ||
          Date.parse(request.expiresAt) <= now().getTime()
        )
          throw new DeviceComputerError("ACCESS_DENIED");
        if (
          grant.revision !== request.grantRevision ||
          grant.connectionFence !== request.connectionFence
        )
          throw new DeviceComputerError("STALE_FENCE");
        const [existing] = await tx
          .select()
          .from(operations)
          .where(
            and(eq(operations.spaceId, context.spaceId), eq(operations.id, request.operationId)),
          );
        if (existing) throw new DeviceComputerError("OUTCOME_UNKNOWN");
        await tx.insert(operations).values({
          spaceId: context.spaceId,
          id: request.operationId,
          deviceId: context.deviceId,
          grantId: context.grantId,
          accountId: context.requesterAccountId,
          runId: context.runId,
          conversationId: context.conversationId,
          payloadHash: request.payloadHash,
          runFence: context.runFence,
          connectionFence: request.connectionFence,
        });
        if (request.operation.kind === "execute")
          await tx.insert(spaceAudit).values({
            spaceId: context.spaceId,
            id: crypto.randomUUID(),
            operationId: request.operationId,
            actorAccountId: context.requesterAccountId,
            action: "device.command",
            targetId: request.operationId,
            outcome: "pending",
          });
      });
    },
    async event(device, sequence, operationId, event) {
      return db.transaction(async (tx) => {
        await deviceLock(tx, device.deviceId);
        const row = await ownedDevice(tx, device);
        if (
          row.connectionFence !== device.connectionFence ||
          !row.connectionExpiresAt ||
          row.connectionExpiresAt <= now()
        )
          throw new DeviceComputerError("STALE_FENCE");
        if (sequence <= row.cursor) {
          const [existing] = await tx
            .select({ operationId: connectorEvents.operationId })
            .from(connectorEvents)
            .where(
              and(
                eq(connectorEvents.deviceId, device.deviceId),
                eq(connectorEvents.sequence, sequence),
                eq(connectorEvents.event, event),
              ),
            );
          if (!existing || existing.operationId !== operationId)
            throw new DeviceComputerError("STALE_FENCE");
          return false;
        }
        if (sequence !== row.cursor + 1) throw new DeviceComputerError("STALE_FENCE");
        const [operation] = await tx
          .select()
          .from(operations)
          .where(and(eq(operations.deviceId, device.deviceId), eq(operations.id, operationId)))
          .for("update");
        if (!operation) throw new DeviceComputerError("NOT_FOUND");
        const [eventCount] = await tx
          .select({ value: sql<number>`count(*)::int` })
          .from(connectorEvents)
          .where(
            and(
              eq(connectorEvents.spaceId, operation.spaceId),
              eq(connectorEvents.operationId, operationId),
            ),
          );
        if ((eventCount?.value ?? 0) >= 2048) throw new DeviceComputerError("LIMIT_EXCEEDED");
        const bytes =
          event.kind === "stdout" || event.kind === "stderr"
            ? Buffer.from(event.bytes, "base64").length
            : 0;
        if (operation.outputBytes + bytes > 1_048_576 || JSON.stringify(event).length > 1_400_000)
          throw new DeviceComputerError("LIMIT_EXCEEDED");
        const terminal = ["exit", "result", "error"].includes(event.kind);
        if (operation.terminal) throw new DeviceComputerError("STALE_FENCE");
        if (terminal) {
          const [intent] = await tx
            .select()
            .from(spaceAudit)
            .where(
              and(
                eq(spaceAudit.spaceId, operation.spaceId),
                eq(spaceAudit.operationId, operationId),
                eq(spaceAudit.outcome, "pending"),
              ),
            )
            .limit(1);
          if (intent) {
            let outcome: "succeeded" | "failed" = "succeeded";
            if (
              event.kind === "error" ||
              (event.kind === "exit" && (event.status !== 0 || event.cancelled))
            )
              outcome = "failed";
            await tx.insert(spaceAudit).values({
              spaceId: operation.spaceId,
              id: crypto.randomUUID(),
              operationId,
              actorAccountId: operation.accountId,
              action: "device.command",
              targetId: operationId,
              outcome,
              code: event.kind === "error" ? event.code : null,
            });
          }
        }
        await tx.insert(connectorEvents).values({
          spaceId: operation.spaceId,
          deviceId: device.deviceId,
          operationId,
          sequence,
          event,
        });
        await tx
          .update(operations)
          .set({ outputBytes: operation.outputBytes + bytes, terminal })
          .where(and(eq(operations.spaceId, operation.spaceId), eq(operations.id, operationId)));
        await tx.update(devices).set({ cursor: sequence }).where(eq(devices.id, device.deviceId));
        return true;
      });
    },
  };
  return repository;
}
