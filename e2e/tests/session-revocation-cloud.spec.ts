import { expect, test } from "@playwright/test";
import { createApiClient, createStreamingApiClient } from "@voidmix/client";
import { accounts, password } from "../database.js";

const api = `http://127.0.0.1:${Number(process.env.VOIDMIX_E2E_PORT ?? 3000) + 2}`;

test("real Better Auth sign-out revokes an already-open private conversation stream", async ({
  page,
}) => {
  const login = await page.request.post(`${api}/api/auth/sign-in/email`, {
    data: { email: accounts.member.email, password },
    headers: { origin: api },
  });
  expect(login.ok()).toBe(true);

  // Keep the original signed cookies in Node: clearing the browser's cookie jar
  // must not be the reason that an already-authenticated connection stops.
  const cookie = (await page.context().cookies(api))
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  expect(cookie.length).toBeGreaterThan(0);
  const client = createApiClient({ baseUrl: api, headers: { cookie } });
  const streams = createStreamingApiClient({ baseUrl: api, headers: { cookie } });
  const conversation = await client.cloud.conversations.create({
    title: "Session revocation acceptance",
    idempotencyKey: crypto.randomUUID(),
  });
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 15_000);
  try {
    const events = (
      await streams.cloud.conversations.stream(
        { conversationId: conversation.id },
        { signal: controller.signal },
      )
    )[Symbol.asyncIterator]();
    const first = await events.next();
    expect(first.done).toBe(false);
    if (first.done) throw new Error("The authenticated stream ended without a snapshot.");
    expect(first.value.conversation.id).toBe(conversation.id);
    expect(first.value.conversation.scope).toEqual({
      type: "personal",
      ownerUserId: accounts.member.id,
    });

    // Attach both outcomes before sign-out so a prompt SSE error cannot become
    // an unhandled rejection. A second private snapshot is a test failure.
    const next = events.next().then(
      (value) => ({ kind: "snapshot" as const, value }),
      (error: unknown) => ({ kind: "error" as const, error }),
    );
    const signOut = await page.request.post(`${api}/api/auth/sign-out`, {
      data: {},
      headers: { origin: api },
    });
    expect(signOut.ok()).toBe(true);
    expect(await next).toMatchObject({ kind: "error", error: { code: "UNAUTHORIZED" } });
    await expect(
      client.cloud.conversations.snapshot({ conversationId: conversation.id }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  } finally {
    clearTimeout(deadline);
    controller.abort();
  }
});
