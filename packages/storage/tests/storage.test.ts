import { expect, it } from "vite-plus/test";
import {
  assertObjectKey,
  createMemoryStorage,
  createObjectStorage,
  createUnavailableStorage,
  StorageError,
} from "../src/index.js";

it("stores, streams, lists and deletes binary objects", async () => {
  const storage = createMemoryStorage();
  await storage.put("avatars/user-1/a.png", new Uint8Array([1, 2, 3]), {
    contentType: "image/png",
  });
  await storage.put("avatars/user-2/b.txt", "text");
  await storage.put("other.txt", new Blob(["blob"]));
  expect(await storage.get("avatars/user-1/a.png")).toEqual(new Uint8Array([1, 2, 3]));
  expect(new TextDecoder().decode((await storage.get("avatars/user-2/b.txt"))!)).toBe("text");
  expect(await new Response(await storage.getStream("other.txt")).text()).toBe("blob");
  expect(await storage.has("avatars/user-1/a.png")).toBe(true);
  expect((await storage.list("avatars")).sort()).toEqual([
    "avatars/user-1/a.png",
    "avatars/user-2/b.txt",
  ]);
  expect(await storage.list("avatars/user-1/")).toEqual(["avatars/user-1/a.png"]);
  await storage.delete("avatars/user-1/a.png");
  expect(await storage.get("avatars/user-1/a.png")).toBeNull();
  expect(await storage.getStream("missing")).toBeNull();
  expect(await storage.has("missing")).toBe(false);
});

it("rejects keys that could escape a prefix or differ between drivers", async () => {
  for (const key of ["", "/a", "a/", "a//b", "../a", "a/./b", "a:b", "a\\b", "a b", "a?b", "é"])
    expect(() => assertObjectKey(key)).toThrow("INVALID_OBJECT_KEY");
  expect(assertObjectKey("users/u_1/file-name.(1).png")).toBe("users/u_1/file-name.(1).png");
  expect(() => assertObjectKey("a".repeat(1025))).toThrow("INVALID_OBJECT_KEY");
  const storage = createMemoryStorage();
  await expect(storage.put("../escape", "x")).rejects.toMatchObject({
    code: "INVALID_OBJECT_KEY",
  });
  await expect(storage.list("../")).rejects.toMatchObject({ code: "INVALID_OBJECT_KEY" });
  await expect(storage.put("a", "x", { metadata: { "Bad Name": "x" } })).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
});

it("sanitizes driver failures and reports missing signing or configuration", async () => {
  const storage = createObjectStorage({
    driver: {
      hasItem: () => {
        throw new Error("https://bucket.example.test/private-key 403 secret response");
      },
      getItem: () => null,
      getKeys: () => [],
    },
  });
  const failure = await storage.has("a").catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(StorageError);
  expect(failure).toMatchObject({ code: "STORAGE_UNAVAILABLE", message: "STORAGE_UNAVAILABLE" });
  await expect(
    createMemoryStorage().signedUrl("a", { method: "GET", expiresIn: 60 }),
  ).rejects.toMatchObject({ code: "STORAGE_SIGNING_UNSUPPORTED" });
  const unavailable = createUnavailableStorage();
  expect(unavailable.available).toBe(false);
  await expect(unavailable.get("a")).rejects.toMatchObject({ code: "STORAGE_NOT_CONFIGURED" });
});
