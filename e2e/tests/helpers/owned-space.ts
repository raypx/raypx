import { expect, type Page } from "@playwright/test";

/** Give each backend journey its own authorization and data boundary. */
export async function createOwnedSpace(page: Page, apiUrl: string, origin: string, name: string) {
  const response = await page.request.post(`${apiUrl}/rpc/spaces/create`, {
    headers: { origin },
    timeout: 5_000,
    data: { json: { name } },
  });
  expect(response.status()).toBe(200);
  const result = (await response.json()) as { json: { space: { id: string } } };
  return result.json.space.id;
}
