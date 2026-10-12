import { createHash } from "node:crypto";
import type { ObjectStorage } from "@voidmix/core";
import { verifyFilesystemDownload, verifyFilesystemUpload } from "@voidmix/storage";
import { bodyLimit } from "hono/body-limit";
import type { Hono, Env } from "hono";

export function mountLocalStorage<E extends Env>(
  app: Hono<E>,
  options: { storage: ObjectStorage; signingSecret: string },
) {
  app.post(
    "/api/cloud/storage/upload",
    bodyLimit({ maxSize: 11 * 1024 * 1024 }),
    async (context) => {
      try {
        const form = await context.req.formData();
        const fields: Record<string, string> = {};
        for (const [key, value] of form.entries())
          if (key !== "file") {
            if (typeof value !== "string" || fields[key] !== undefined)
              return context.json({ code: "INVALID_UPLOAD" }, 400);
            fields[key] = value;
          }
        const metadata = verifyFilesystemUpload({ fields, signingSecret: options.signingSecret });
        const file = form.get("file");
        if (
          !(file instanceof Blob) ||
          file.size !== metadata.byteSize ||
          file.size > 10 * 1024 * 1024
        )
          return context.json({ code: "INVALID_UPLOAD" }, 400);
        const body = new Uint8Array(await file.arrayBuffer());
        if (createHash("sha256").update(body).digest("hex") !== metadata.checksumSha256)
          return context.json({ code: "INVALID_UPLOAD" }, 400);
        await options.storage.put({
          key: metadata.key,
          contentType: metadata.contentType,
          checksumSha256: metadata.checksumSha256,
          body,
        });
        return context.body(null, 204);
      } catch {
        return context.json({ code: "INVALID_UPLOAD" }, 400);
      }
    },
  );
  app.get("/api/cloud/storage/download", async (context) => {
    try {
      const fields = Object.fromEntries(new URL(context.req.url).searchParams);
      const { key, filename } = verifyFilesystemDownload({
        fields,
        signingSecret: options.signingSecret,
      });
      const object = await options.storage.read(key);
      if (!object) return context.json({ code: "OBJECT_NOT_FOUND" }, 404);
      const iterator = object.body[Symbol.asyncIterator]();
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const item = await iterator.next();
            if (item.done) controller.close();
            else controller.enqueue(item.value);
          } catch (error) {
            controller.error(error);
          }
        },
        async cancel() {
          await iterator.return?.();
        },
      });
      context.header("Cache-Control", "private, no-store");
      context.header("X-Content-Type-Options", "nosniff");
      context.header("Content-Security-Policy", "default-src 'none'; sandbox");
      context.header("Content-Type", object.metadata.contentType);
      context.header("Content-Length", String(object.metadata.byteSize));
      context.header(
        "Content-Disposition",
        filename
          ? `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(filename)}`
          : "inline",
      );
      return context.body(stream);
    } catch {
      return context.json({ code: "INVALID_DOWNLOAD" }, 403);
    }
  });
}
