import { afterEach, expect, it, vi } from "vitest";
import { createS3ObjectStorage } from "./object-storage.js";

afterEach(() => vi.unstubAllGlobals());

it("uses bounded backend-only S3 requests and omits unsafe provider diagnostics", async () => {
  const bytes = Buffer.from("attachment");
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response(null))
    .mockResolvedValueOnce(new Response(bytes))
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(new Response(Buffer.from("longer")))
    .mockResolvedValueOnce(new Response("provider details", { status: 403 }));
  vi.stubGlobal("fetch", fetch);
  const store = createS3ObjectStorage({
    endpoint: "https://00000000000000000000000000000000.r2.cloudflarestorage.com",
    bucket: "raypx-test",
    region: "auto",
    accessKeyId: "fixture-key",
    secretAccessKey: "fixture-secret",
  });
  const key = "raypx/message-attachments/test";
  await store.put(key, bytes);
  expect(await store.read(key, bytes.length)).toEqual(bytes);
  await store.remove(key);
  await expect(store.read(key, 2)).rejects.toThrow("OBJECT_STORAGE_UNAVAILABLE");
  await expect(store.put(key, bytes)).rejects.toThrow("OBJECT_STORAGE_UNAVAILABLE");
  expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual([
    "PUT",
    "GET",
    "DELETE",
    "GET",
    "PUT",
  ]);
  for (const [target, init] of fetch.mock.calls) {
    if (typeof target !== "string") throw new Error("Expected a signed URL");
    const url = new URL(target);
    expect(url.pathname).toBe("/raypx-test/" + key);
    expect(url.searchParams.get("X-Amz-Credential")).toContain("/auto/s3/aws4_request");
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  }
});
