import { afterEach, expect, test, vi } from "vite-plus/test";
import { getSession } from "../src/session.js";

afterEach(() => vi.unstubAllGlobals());
test("session requests validate data and forward cancellation through the JSON client", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ user: null }));
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  expect(await getSession({ signal: controller.signal })).toEqual({ user: null });
  expect(fetch).toHaveBeenCalledWith(
    "/api/session",
    expect.objectContaining({ credentials: "same-origin", signal: expect.any(AbortSignal) }),
  );
  fetch.mockResolvedValueOnce(Response.json({ user: "unvalidated" }));
  await expect(getSession()).rejects.toMatchObject({ kind: "invalid-response" });
});
