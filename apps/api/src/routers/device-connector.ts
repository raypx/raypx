import { bodyLimit } from "hono/body-limit";
import type { RateLimiter } from "../rate-limit/types.js";
import { Hono } from "hono";
import { setWebSocketHooks, type Hooks } from "crossws";
import {
  DEVICE_CONNECTOR_PATHS,
  DEVICE_CONNECTOR_MAX_FRAME_BYTES,
  devicePairingClaimSchema,
  devicePairingConfirmSchema,
  deviceGrantConfirmSchema,
  deviceGrantRevokeSchema,
} from "@raypx/contracts/device-connector";
import { DeviceComputerError, type DeviceConnectorRegistry } from "@raypx/computers/server";
/** Native-only possession endpoints: no browser session, cookies or renderer exposure. */
export function createDeviceConnectorRoutes(
  registry: DeviceConnectorRegistry,
  options: { rateLimit?: RateLimiter; clientIpHeader?: string } = {},
) {
  const app = new Hono();
  const openings = new Map<string, Promise<void>>();
  app.use(
    "/device/*",
    bodyLimit({ maxSize: 16_384, onError: (c) => c.json({ error: "PAYLOAD_TOO_LARGE" }, 413) }),
  );
  app.use("/device/*", async (c, next) => {
    c.header("cache-control", "no-store");
    if (c.req.header("origin")) return c.json({ error: "ACCESS_DENIED" }, 403);
    return next();
  });
  app.use("/device/*", async (c, next) => {
    const authorization = c.req.header("authorization");
    if (authorization && authorization.length > 520) return c.json({ error: "ACCESS_DENIED" }, 403);
    if (options.rateLimit) {
      const pairing =
        c.req.path === DEVICE_CONNECTOR_PATHS.claim ||
        c.req.path === DEVICE_CONNECTOR_PATHS.confirm;
      const address =
        (options.clientIpHeader ? c.req.header(options.clientIpHeader) : undefined) ??
        "unidentified";
      const addressDigest = Buffer.from(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address)),
      ).toString("hex");
      const admitted = await options.rateLimit(
        `device-connector:ip:${c.req.path}:${addressDigest}`,
        { window: 60, max: pairing ? 20 : 120 },
      );
      if (!admitted) {
        c.header("retry-after", "60");
        return c.json({ error: "RATE_LIMITED" }, 429);
      }
      if (authorization && !pairing) {
        const credentialDigest = Buffer.from(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(authorization)),
        ).toString("hex");
        if (
          !(await options.rateLimit(
            `device-connector:credential:${c.req.path}:${credentialDigest}`,
            { window: 60, max: 60 },
          ))
        ) {
          c.header("retry-after", "60");
          return c.json({ error: "RATE_LIMITED" }, 429);
        }
      }
    }
    return next();
  });
  function bearer(headers: Headers) {
    const value = headers.get("authorization");
    if (!value?.startsWith("Bearer ") || value.length > 520 || /\s/.test(value.slice(7)))
      throw new DeviceComputerError("ACCESS_DENIED");
    return value.slice(7);
  }
  app.onError((error, c) =>
    c.json({ error: error instanceof DeviceComputerError ? error.code : "ACCESS_DENIED" }, 403),
  );
  app.post("/device/*", async (c) => {
    const body = await c.req.text();
    if (Buffer.byteLength(body) > 16_384) return c.json({ error: "INVALID_INPUT" }, 400);
    let input: unknown;
    try {
      input = JSON.parse(body);
    } catch {
      return c.json({ error: "INVALID_INPUT" }, 400);
    }
    const path = c.req.path;
    if (path === DEVICE_CONNECTOR_PATHS.claim) {
      const parsed = devicePairingClaimSchema.safeParse(input);
      if (!parsed.success) return c.json({ error: "INVALID_INPUT" }, 400);
      return c.json(await registry.repository.claim(parsed.data));
    }
    if (path === DEVICE_CONNECTOR_PATHS.confirm) {
      const parsed = devicePairingConfirmSchema.safeParse(input);
      if (!parsed.success) return c.json({ error: "INVALID_INPUT" }, 400);
      return c.json(await registry.repository.confirm(parsed.data));
    }
    const identity = await registry.repository.authenticate(bearer(c.req.raw.headers));
    if (path === DEVICE_CONNECTOR_PATHS.grant || path === "/device/grants/prepare") {
      const parsed = deviceGrantConfirmSchema.safeParse(input);
      if (!parsed.success || parsed.data.deviceId !== identity.deviceId)
        return c.json({ error: "INVALID_INPUT" }, 400);
      if (path === "/device/grants/prepare")
        return c.json(
          await registry.repository.prepareGrant(
            identity,
            parsed.data.spaceId,
            parsed.data.directory,
          ),
        );
      const grant = await registry.repository.grant(identity, parsed.data);
      await registry.refresh(identity);
      return c.json(grant);
    }
    if (path === DEVICE_CONNECTOR_PATHS.revokeGrant) {
      const parsed = deviceGrantRevokeSchema.safeParse(input);
      if (!parsed.success || parsed.data.deviceId !== identity.deviceId)
        return c.json({ error: "INVALID_INPUT" }, 400);
      await registry.repository.revokeGrant(identity, parsed.data.spaceId, parsed.data.grantId);
      await registry.refresh(identity);
      return c.json({ ok: true });
    }
    if (path === DEVICE_CONNECTOR_PATHS.revoke) {
      await registry.revoke(identity);
      return c.json({ ok: true });
    }
    return c.json({ error: "NOT_FOUND" }, 404);
  });
  app.get(DEVICE_CONNECTOR_PATHS.connect, async (c) => {
    const request = c.req.raw;
    const response = c.json({ error: "UPGRADE_REQUIRED" }, 426);
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return response;
    let credential: string;
    try {
      credential = bearer(request.headers);
      await registry.repository.authenticate(credential);
    } catch {
      const denied = c.json({ error: "ACCESS_DENIED" }, 401);
      setWebSocketHooks(request, { upgrade: () => denied });
      return denied;
    }
    const hooks: Partial<Hooks> = {
      open(peer) {
        const opening = (async () => {
          try {
            await registry.open(peer.id, credential, {
              send(frame) {
                const encoded = JSON.stringify(frame);
                if (
                  Buffer.byteLength(encoded) > DEVICE_CONNECTOR_MAX_FRAME_BYTES ||
                  peer.bufferedAmount > DEVICE_CONNECTOR_MAX_FRAME_BYTES ||
                  peer.send(encoded) === 0
                )
                  throw new Error("Connector backpressure");
              },
              close: (code, reason) => peer.close(code, reason),
            });
          } catch {
            peer.close(4003, "Access denied");
          }
        })();
        openings.set(peer.id, opening);
        return opening;
      },
      message(peer, message) {
        if (typeof message.rawData !== "string") {
          peer.close(4000, "Invalid frame");
          return;
        }
        const raw = message.rawData;
        void openings.get(peer.id)?.then(() => registry.receive(peer.id, raw));
      },
      close(peer) {
        const opening = openings.get(peer.id);
        openings.delete(peer.id);
        void opening?.then(() => registry.close(peer.id));
      },
    };
    setWebSocketHooks(request, hooks);
    return response;
  });
  return app;
}
