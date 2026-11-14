import type { Page } from "@playwright/test";
import { createApiClient } from "@raypx/client/api";

/** Shares only the current test context's cookie jar with its explicitly owned API. */
export function ownedApi(page: Page, origin: string, endpoint: string) {
  return createApiClient({
    baseUrl: endpoint,
    headers: { origin },
    fetch: async (input, init) => {
      const response = await page.request.fetch(input, {
        method: init?.method ?? "POST",
        headers: Object.fromEntries(new Headers(init?.headers)),
        ...(typeof init?.body === "string" ? { data: init.body } : {}),
        timeout: 5_000,
      });
      return new Response(await response.text(), {
        status: response.status(),
        headers: response.headers(),
      });
    },
  });
}
