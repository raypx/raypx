import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, timingSafeEqual } from "node:crypto";
import { APIError } from "better-auth/api";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  accountBootstrap,
  spaceInvitations,
  spaceMembers,
  spaces,
  systemConfiguration,
  user,
} from "@raypx/database/schema";
import { createRateLimiter } from "../rate-limit.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const digest = (value: string) => createHash("sha256").update(value).digest();
export function matchesSetupToken(expected: string, supplied: string): boolean {
  return timingSafeEqual(digest(expected), digest(supplied));
}
function refused(code: string) {
  // 400 preserves Better Auth's refusal; 403 becomes a synthetic duplicate response.
  return new APIError("BAD_REQUEST", {
    code,
    message: "Registration is unavailable or requires an invitation or setup token",
  });
}

/** Request secrets stay in request-local memory, outside auth records and diagnostics. */
export function createRegistration(
  db: Database,
  options: {
    setupToken?: string;
    mailAvailable(this: void, tx: Transaction): Promise<boolean>;
    clientIpHeader?: string;
  },
) {
  const requests = new AsyncLocalStorage<Headers>();
  const limit = createRateLimiter(db);
  async function status() {
    const [marker] = await db
      .select()
      .from(accountBootstrap)
      .where(eq(accountBootstrap.id, "deployment"));
    const [existing] = await db.select({ id: user.id }).from(user).limit(1);
    return {
      bootstrap: !marker?.completedAt && !existing,
      setupTokenRequired: !marker?.completedAt && !existing && !!options.setupToken,
    };
  }
  return {
    mailAvailable: options.mailAvailable,
    status,
    async handle(request: Request, next: () => Promise<Response>) {
      if (
        request.method === "POST" &&
        new URL(request.url).pathname.replace(/\/+$/, "").endsWith("/sign-up/email") &&
        (await status()).bootstrap
      ) {
        const ip = options.clientIpHeader ? request.headers.get(options.clientIpHeader) : null;
        if (
          !(await limit(`account-setup:${digest(ip ?? "unknown").toString("hex")}`, {
            window: 60,
            max: 5,
          }))
        )
          return Response.json(
            { code: "TOO_MANY_REQUESTS" },
            { status: 429, headers: { "Retry-After": "60" } },
          );
      }
      return requests.run(request.headers, next);
    },
    async create<T>(
      tx: Transaction,
      data: Record<string, unknown>,
      insert: (data: Record<string, unknown>) => Promise<T>,
    ): Promise<T> {
      data = { ...data, id: typeof data.id === "string" ? data.id : crypto.randomUUID() };
      // Serializes all auth creation paths, across processes. Marker and user commit together.
      await tx.insert(accountBootstrap).values({ id: "deployment" }).onConflictDoNothing();
      const [marker] = await tx
        .select()
        .from(accountBootstrap)
        .where(eq(accountBootstrap.id, "deployment"))
        .for("update");
      const [existing] = await tx.select({ id: user.id }).from(user).limit(1);
      const first = !marker!.completedAt && !existing;
      if (
        first &&
        options.setupToken &&
        !matchesSetupToken(
          options.setupToken,
          requests.getStore()?.get("x-raypx-setup-token") ?? "",
        )
      )
        throw refused("INVALID_SETUP_TOKEN");
      const [configuration] = await tx
        .select()
        .from(systemConfiguration)
        .where(eq(systemConfiguration.id, "site"));
      const invitation = requests.getStore()?.get("x-raypx-invitation");
      if (!first && (configuration?.registrationEnabled === false || invitation)) {
        if (!invitation || !/^[a-f0-9]{64}$/.test(invitation))
          throw refused("REGISTRATION_DISABLED");
        const [row] = await tx
          .select()
          .from(spaceInvitations)
          .where(eq(spaceInvitations.tokenHash, digest(invitation).toString("hex")))
          .for("update");
        if (
          !row ||
          row.status !== "open" ||
          row.expiresAt <= new Date() ||
          row.registrationAccountId
        )
          throw refused("INVALID_INVITATION");
        const [owner] = await tx
          .select({ id: spaces.id })
          .from(spaces)
          .innerJoin(
            spaceMembers,
            and(
              eq(spaceMembers.spaceId, spaces.id),
              eq(spaceMembers.accountId, row.inviterAccountId),
              eq(spaceMembers.role, "owner"),
              isNull(spaceMembers.removedAt),
            ),
          )
          .where(and(eq(spaces.id, row.spaceId), isNull(spaces.deletionClaimedAt)));
        if (!owner) throw refused("INVALID_INVITATION");
        await tx
          .update(spaceInvitations)
          .set({ registrationAccountId: String(data.id) })
          .where(and(eq(spaceInvitations.spaceId, row.spaceId), eq(spaceInvitations.id, row.id)));
      }
      const created = await insert({
        ...data,
        role: first ? "admin" : "member",
        emailVerificationSkipped: !(await options.mailAvailable(tx)),
      });
      if (!marker!.completedAt)
        await tx
          .update(accountBootstrap)
          .set({ completedAt: sql`now()` })
          .where(eq(accountBootstrap.id, "deployment"));
      return created;
    },
  };
}
export type Registration = ReturnType<typeof createRegistration>;
