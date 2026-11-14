import { and, count, eq, gt, isNull, lte, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  deviceMemberFileReads as reads,
  deviceDirectoryGrants as grants,
  deviceComputers as devices,
  spaceMembers,
  spaces,
} from "@raypx/database/schema";
import { deviceMemberReadResultSchema } from "@raypx/contracts/device-connector";
import { ComputerError, workspacePath } from "@raypx/providers/computer";
import { DeviceComputerError } from "../devices.js";
import type { DeviceMemberFilesRepository, DeviceMemberFilesService } from "../member-files.js";
import type { DeviceConnectorRegistry } from "../device-registry.js";
import type { SpaceScope } from "@raypx/spaces/server";

export function createDeviceMemberFilesRepository(
  db: Database,
  origin: string,
): DeviceMemberFilesRepository {
  async function admitted(scope: SpaceScope, selection: { deviceId: string; grantId: string }) {
    const [row] = await db
      .select({ grant: grants, device: devices })
      .from(grants)
      .innerJoin(
        devices,
        and(eq(devices.id, grants.deviceId), eq(devices.accountId, grants.accountId)),
      )
      .innerJoin(
        spaceMembers,
        and(eq(spaceMembers.spaceId, grants.spaceId), eq(spaceMembers.accountId, grants.accountId)),
      )
      .innerJoin(spaces, eq(spaces.id, grants.spaceId))
      .where(
        and(
          eq(grants.spaceId, scope.spaceId),
          eq(grants.id, selection.grantId),
          eq(grants.deviceId, selection.deviceId),
          eq(grants.accountId, scope.member.accountId),
          eq(devices.origin, origin),
          isNull(spaceMembers.removedAt),
          isNull(spaces.deletionClaimedAt),
        ),
      );
    if (!row) throw new DeviceComputerError("ACCESS_DENIED");
    if (row.grant.revokedAt || row.device.revokedAt)
      throw new DeviceComputerError("DEVICE_REVOKED");
    if (
      !row.device.connectionOwner ||
      !row.device.connectionExpiresAt ||
      row.device.connectionExpiresAt.getTime() <= Date.now()
    )
      throw new DeviceComputerError("DEVICE_OFFLINE");
    return row;
  }
  return {
    async cleanup() {
      await db.execute(
        sql`delete from ${reads} where ctid in (select ctid from ${reads} where ${reads.expiresAt} <= clock_timestamp() order by ${reads.expiresAt} limit 100 for update skip locked)`,
      );
    },
    async prepare(scope, selection, operation) {
      const path = workspacePath(operation.path) || ".";
      const { grant, device } = await admitted(scope, selection);
      const request = {
        id: crypto.randomUUID(),
        deviceId: device.id,
        accountId: device.accountId,
        spaceId: scope.spaceId,
        grantId: grant.id,
        grantRevision: grant.revision,
        connectionFence: device.connectionFence,
        expiresAt: new Date(Date.now() + 10_000).toISOString(),
        operation: { ...operation, path },
      };
      await db.transaction(async (tx) => {
        const [member] = await tx
          .select()
          .from(spaceMembers)
          .where(
            and(
              eq(spaceMembers.spaceId, scope.spaceId),
              eq(spaceMembers.accountId, scope.member.accountId),
              isNull(spaceMembers.removedAt),
            ),
          )
          .for("update");
        if (!member) throw new DeviceComputerError("ACCESS_DENIED");
        await tx
          .delete(reads)
          .where(
            and(
              eq(reads.spaceId, scope.spaceId),
              eq(reads.accountId, scope.member.accountId),
              lte(reads.expiresAt, sql`clock_timestamp()`),
            ),
          );
        const [pending] = await tx
          .select({ count: count() })
          .from(reads)
          .where(
            and(eq(reads.spaceId, scope.spaceId), eq(reads.accountId, scope.member.accountId)),
          );
        if (pending!.count >= 8) throw new DeviceComputerError("LIMIT_EXCEEDED");
        await tx.insert(reads).values({
          ...request,
          operation: request.operation,
          expiresAt: new Date(request.expiresAt),
        });
      });
      return {
        request,
        identity: {
          deviceId: device.id,
          accountId: device.accountId,
          credentialRevision: device.credentialRevision,
        },
        route: { owner: device.connectionOwner!, fence: device.connectionFence },
      };
    },
    async complete(device, id, result) {
      await db
        .update(reads)
        .set({ result: deviceMemberReadResultSchema.parse(result) })
        .where(
          and(
            eq(reads.id, id),
            eq(reads.deviceId, device.deviceId),
            eq(reads.accountId, device.accountId),
            eq(reads.connectionFence, device.connectionFence),
            gt(reads.expiresAt, sql`clock_timestamp()`),
            isNull(reads.result),
            sql`exists (select 1 from ${devices} where ${devices.id} = ${reads.deviceId} and ${devices.connectionFence} = ${device.connectionFence} and ${devices.revokedAt} is null)`,
          ),
        );
    },
    async take(scope, id) {
      const [row] = await db
        .select()
        .from(reads)
        .where(
          and(
            eq(reads.spaceId, scope.spaceId),
            eq(reads.id, id),
            eq(reads.accountId, scope.member.accountId),
            gt(reads.expiresAt, sql`clock_timestamp()`),
          ),
        );
      if (!row) throw new DeviceComputerError("DEVICE_OFFLINE");
      const current = await admitted(scope, { deviceId: row.deviceId, grantId: row.grantId });
      if (
        current.grant.revision !== row.grantRevision ||
        current.device.connectionFence !== row.connectionFence
      )
        throw new DeviceComputerError("STALE_FENCE");
      return row.result ? deviceMemberReadResultSchema.parse(row.result) : null;
    },
    async remove(scope, id) {
      await db
        .delete(reads)
        .where(
          and(
            eq(reads.spaceId, scope.spaceId),
            eq(reads.accountId, scope.member.accountId),
            eq(reads.id, id),
          ),
        );
    },
  };
}
function failure(
  error: unknown,
): Exclude<import("@raypx/core/computers").ComputerDirectory, { status: "available" }> {
  if (error instanceof DeviceComputerError) {
    if (error.code === "DEVICE_OFFLINE") return { status: "waiting", code: "DEVICE_OFFLINE" };
    if (error.code === "ACCESS_DENIED" || error.code === "NOT_FOUND")
      return { status: "unavailable", code: "DEVICE_NOT_OWNED" };
    return { status: "unavailable", code: "DEVICE_GRANT_UNAVAILABLE" };
  }
  if (error instanceof ComputerError)
    return { status: "unavailable", code: "DEVICE_GRANT_UNAVAILABLE" };
  return { status: "unavailable", code: "COMPUTER_UNAVAILABLE" };
}
export function createDeviceMemberFilesService(
  registry: DeviceConnectorRegistry,
): DeviceMemberFilesService {
  return {
    async listDirectory(scope, device, path, limit) {
      try {
        const result = await registry.memberRead(scope, device, { kind: "list", path, limit });
        if (result.kind !== "list")
          return { status: "unavailable", code: "DEVICE_GRANT_UNAVAILABLE" };
        return {
          status: "available",
          entries: result.entries.slice(0, limit),
          truncated: result.truncated || result.entries.length > limit,
        };
      } catch (error) {
        return failure(error);
      }
    },
    async readFile(scope, device, path, maxBytes) {
      try {
        const result = await registry.memberRead(scope, device, { kind: "read", path, maxBytes });
        if (result.kind !== "read")
          return { status: "unavailable", code: "DEVICE_GRANT_UNAVAILABLE" };
        const bytes = Buffer.from(result.bytes, "base64");
        if (
          bytes.length > maxBytes ||
          bytes.length > result.size ||
          (!result.truncated && bytes.length !== result.size)
        )
          return { status: "unavailable", code: "FILES_UNAVAILABLE" };
        let contentType: "text" | "binary" = "binary";
        try {
          new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: result.truncated });
          if (!bytes.some((byte) => byte === 127 || (byte < 32 && ![9, 10, 13].includes(byte))))
            contentType = "text";
        } catch {
          /* Binary previews stay inert. */
        }
        return {
          status: "available",
          bytes: result.bytes,
          size: result.size,
          truncated: result.truncated,
          contentType,
        };
      } catch (error) {
        return failure(error);
      }
    },
  };
}
