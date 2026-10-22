import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { createS3Storage } from "../src/s3.js";

const config = {
  endpoint: "https://s3.example.test/",
  region: "auto",
  bucket: "raypx",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
};

/** Minimal path-style S3 endpoint: PUT/GET/HEAD/DELETE objects and ListObjectsV2. */
function fakeS3() {
  const objects = new Map<string, { body: Uint8Array<ArrayBuffer>; headers: Headers }>();
  const requests: Request[] = [];
  const handler = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request.clone());
    const url = new URL(request.url);
    const prefix = "/raypx";
    if (!url.pathname.startsWith(prefix)) return new Response(null, { status: 404 });
    const key = decodeURIComponent(url.pathname.slice(prefix.length + 1));
    if (!key && request.method === "GET" && url.searchParams.get("list-type") === "2") {
      const listPrefix = url.searchParams.get("prefix") ?? "";
      const contents = [...objects.keys()]
        .filter((name) => name.startsWith(listPrefix))
        .map((name) => `<Contents><Key>${name}</Key></Contents>`)
        .join("");
      return new Response(
        `<?xml version="1.0"?><ListBucketResult>${contents}<IsTruncated>false</IsTruncated></ListBucketResult>`,
      );
    }
    const object = objects.get(key);
    switch (request.method) {
      case "PUT":
        objects.set(key, {
          body: new Uint8Array(await request.arrayBuffer()),
          headers: request.headers,
        });
        return new Response(null, { status: 200 });
      case "GET":
        return object ? new Response(object.body) : new Response(null, { status: 404 });
      case "HEAD":
        return new Response(null, { status: object ? 200 : 404 });
      case "DELETE":
        objects.delete(key);
        return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 400 });
  };
  return { objects, requests, handler };
}

let s3: ReturnType<typeof fakeS3>;
beforeEach(() => {
  s3 = fakeS3();
  vi.stubGlobal("fetch", vi.fn(s3.handler));
});
afterEach(() => vi.unstubAllGlobals());

it("reads and writes objects through signed path-style requests", async () => {
  const storage = createS3Storage(config);
  await storage.put("avatars/user-1/a.png", new Uint8Array([1, 2, 3]), {
    contentType: "image/png",
    cacheControl: "public, max-age=60",
    metadata: { owner: "user-1" },
  });
  const put = s3.requests[0]!;
  expect(put.url).toBe("https://s3.example.test/raypx/avatars/user-1/a.png");
  expect(put.headers.get("authorization")).toMatch(
    /^AWS4-HMAC-SHA256 Credential=test-access-key\/\d{8}\/auto\/s3\/aws4_request/,
  );
  const stored = s3.objects.get("avatars/user-1/a.png")!;
  expect(stored.headers.get("content-type")).toBe("image/png");
  expect(stored.headers.get("cache-control")).toBe("public, max-age=60");
  expect(stored.headers.get("x-amz-meta-owner")).toBe("user-1");

  expect(await storage.get("avatars/user-1/a.png")).toEqual(new Uint8Array([1, 2, 3]));
  expect(await storage.has("avatars/user-1/a.png")).toBe(true);
  expect(await storage.list("avatars")).toEqual(["avatars/user-1/a.png"]);
  expect(await storage.get("missing")).toBeNull();
  await storage.delete("avatars/user-1/a.png");
  expect(await storage.has("avatars/user-1/a.png")).toBe(false);
});

it("maps S3 errors to a code without URLs or response bodies", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("<Error>AccessDenied private</Error>", { status: 403 })),
  );
  const failure = await createS3Storage(config)
    .get("a")
    .catch((error: unknown) => error);
  expect(failure).toMatchObject({ code: "STORAGE_UNAVAILABLE", message: "STORAGE_UNAVAILABLE" });
});

it("pre-signs downloads and content-type-bound uploads without network calls", async () => {
  const storage = createS3Storage(config);
  const download = new URL(
    await storage.signedUrl("avatars/user-1/a-b.png", {
      method: "GET",
      expiresIn: 300,
    }),
  );
  expect(download.origin + download.pathname).toBe(
    "https://s3.example.test/raypx/avatars/user-1/a-b.png",
  );
  expect(download.searchParams.get("X-Amz-Expires")).toBe("300");
  expect(download.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
  expect(download.searchParams.get("X-Amz-Credential")).toMatch(/^test-access-key\/\d{8}\/auto\//);
  expect(download.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
  expect(download.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  expect(download.href).not.toContain("test-secret-key");

  const upload = new URL(
    await storage.signedUrl("uploads/u.png", {
      method: "PUT",
      expiresIn: 60,
      contentType: "image/png",
    }),
  );
  expect(upload.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
  expect(fetch).not.toHaveBeenCalled();
  for (const expiresIn of [0, 604_801, 1.5])
    await expect(storage.signedUrl("a", { method: "GET", expiresIn })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
});
