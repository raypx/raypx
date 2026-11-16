import { S3Client } from "bun";

const timeoutMs = 5_000;

/** Signed requests stay inside the backend. Responses and URLs never enter errors. */
export function createS3ObjectStorage(options: {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}) {
  const client = new S3Client(options);

  async function request(
    key: string,
    method: "GET" | "PUT" | "DELETE",
    body?: Buffer<ArrayBuffer>,
  ) {
    try {
      const response = await fetch(client.presign(key, { method, expiresIn: 30 }), {
        method,
        ...(body ? { body, headers: { "content-type": "application/octet-stream" } } : {}),
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok || (method === "DELETE" && response.status === 404)) return response;
      await response.body?.cancel();
    } catch {
      // Transport failures can contain a signed URL.
    }
    throw new Error("OBJECT_STORAGE_UNAVAILABLE");
  }

  return {
    async put(key: string, bytes: Buffer<ArrayBuffer>) {
      const response = await request(key, "PUT", bytes);
      await response.body?.cancel();
    },
    async read(key: string, size: number) {
      const response = await request(key, "GET");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("OBJECT_STORAGE_UNAVAILABLE");
      const bytes = Buffer.alloc(size);
      let offset = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (offset + value.length > size) throw new Error("OBJECT_STORAGE_UNAVAILABLE");
          bytes.set(value, offset);
          offset += value.length;
        }
        if (offset !== size) throw new Error("OBJECT_STORAGE_UNAVAILABLE");
        return bytes;
      } catch {
        throw new Error("OBJECT_STORAGE_UNAVAILABLE");
      } finally {
        await reader.cancel().catch(() => {});
      }
    },
    async remove(key: string) {
      const response = await request(key, "DELETE");
      await response.body?.cancel();
    },
  };
}
