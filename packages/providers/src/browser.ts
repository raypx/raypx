import type { BrowserCommand } from "@raypx/core/browser";
import { z } from "zod";

const errorCode = z.object({ code: z.string().regex(/^BROWSER_[A-Z_]{1,40}$/) });
export class BrowserError extends Error {}
export interface BrowserSessionIdentity {
  spaceId: string;
  conversationId: string;
  accountId: string;
}

/** The private broker owns Chrome and its short-lived input/preview state. */
export function createBrowserProvider(endpoint: string, token: string, applicationKey: string) {
  const base = new URL(endpoint);
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    !["http:", "https:"].includes(base.protocol)
  )
    throw new Error("Invalid browser broker endpoint");
  const encoder = new TextEncoder();
  return {
    async request<T>(
      identity: BrowserSessionIdentity,
      command: BrowserCommand,
      schema: z.ZodType<T>,
      signal?: AbortSignal,
    ): Promise<T> {
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(applicationKey),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const digest = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(
          JSON.stringify([
            "browser",
            identity.spaceId,
            identity.conversationId,
            identity.accountId,
          ]),
        ),
      );
      const session = Buffer.from(digest).toString("hex");
      try {
        const deadline = AbortSignal.timeout(20_000);
        const response = await fetch(new URL(`/sessions/${session}`, base), {
          method: "POST",
          redirect: "error",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify(command),
          signal: signal ? AbortSignal.any([deadline, signal]) : deadline,
        });
        const result: unknown = await response.json();
        if (!response.ok)
          throw new BrowserError(errorCode.safeParse(result).data?.code ?? "BROWSER_UNAVAILABLE");
        return schema.parse(result);
      } catch (error) {
        if (error instanceof BrowserError) throw error;
        throw new BrowserError("BROWSER_UNAVAILABLE");
      }
    },
  };
}
export type BrowserProvider = ReturnType<typeof createBrowserProvider>;
