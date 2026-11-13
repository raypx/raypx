import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  ComputerError,
  MAX_HOME_BYTES,
  commandSchema,
  computerRefSchema,
  homeArchiveSchema,
  type ComputerProcess,
  type ComputerProvider,
} from "@raypx/providers/computer";
export function supervisorHandler(provider: ComputerProvider, token: string) {
  const processes = new Map<string, { ref: string; process: ComputerProcess }>();
  return async function handle(request: Request): Promise<Response> {
    const supplied = Buffer.from(request.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
    try {
      const url = new URL(request.url);
      if (url.pathname === "/description" && request.method === "GET")
        return Response.json(await provider.describe());
      const match =
        /^\/computers\/([^/]+)\/(create|get|exec|cancel|files\/list|files\/read|files\/write|stop|destroy|snapshot|home\/export|home\/import)$/.exec(
          url.pathname,
        );
      if (!match || request.method !== "POST")
        return Response.json({ code: "NOT_FOUND" }, { status: 404 });
      const reader = request.body?.getReader();
      if (!reader) throw new ComputerError("INVALID_INPUT");
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_HOME_BYTES * 2) throw new ComputerError("LIMIT_EXCEEDED");
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const body = z
        .object({ generation: computerRefSchema.shape.generation })
        .passthrough()
        .parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      const ref = computerRefSchema.parse({ id: match[1], generation: body.generation });
      const key = `${ref.id}:${ref.generation}`;
      const operation = match[2];
      if (operation === undefined) throw new ComputerError("INVALID_INPUT");
      switch (operation) {
        case "create":
          return Response.json(await provider.provision(ref));
        case "get":
          return Response.json(await provider.get(ref));
        case "stop":
          return Response.json(await provider.stop(ref));
        case "destroy":
          return Response.json(await provider.destroy(ref));
        case "snapshot":
          return Response.json(await provider.snapshot(ref));
        case "home/export":
          return Response.json(await provider.exportHome(ref));
        case "home/import":
          return Response.json(
            await provider.importHome(ref, homeArchiveSchema.parse(body.archive)),
          );
        case "files/list":
          return Response.json(
            await provider.list(
              ref,
              z.string().parse(body.path),
              z.number().int().min(1).max(1000).parse(body.limit),
            ),
          );
        case "files/read":
          return Response.json(
            await provider.read(
              ref,
              z.string().parse(body.path),
              z.number().int().min(1).max(MAX_HOME_BYTES).parse(body.maxBytes),
            ),
          );
        case "files/write":
          await provider.write(ref, z.string().parse(body.path), z.base64().parse(body.bytes));
          return Response.json({});
        case "cancel": {
          await provider.get(ref); // A stale generation cannot cancel a replacement's process.
          const id = z.string().uuid().parse(body.executionId);
          const active = processes.get(id);
          if (active && active.ref !== key) throw new ComputerError("NOT_FOUND");
          await active?.process.cancel();
          return Response.json({});
        }
        case "exec": {
          const id = z.string().uuid().parse(body.executionId);
          if (processes.has(id)) throw new ComputerError("INVALID_INPUT");
          const process = await provider.execute(ref, commandSchema.parse(body.command));
          processes.set(id, { ref: key, process });
          const iterator = process.events[Symbol.asyncIterator]();
          const encoder = new TextEncoder();
          const stream = new ReadableStream<Uint8Array>({
            async pull(controller) {
              try {
                const { value, done } = await iterator.next();
                if (done) {
                  processes.delete(id);
                  controller.close();
                } else controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
              } catch {
                processes.delete(id);
                controller.error(new ComputerError("PROVIDER_UNAVAILABLE"));
              }
            },
            async cancel() {
              processes.delete(id);
              await process.cancel();
              await iterator.return?.();
            },
          });
          return new Response(stream, {
            headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" },
          });
        }
        default:
          throw new ComputerError("INVALID_INPUT");
      }
    } catch (error) {
      let code = "PROVIDER_UNAVAILABLE";
      if (error instanceof z.ZodError || error instanceof SyntaxError) code = "INVALID_INPUT";
      if (error instanceof ComputerError) code = error.code;
      const statuses: Record<string, number> = {
        NOT_FOUND: 404,
        STALE_GENERATION: 409,
        NOT_RUNNING: 409,
        INVALID_INPUT: 400,
        LIMIT_EXCEEDED: 413,
        RESTORE_FAILED: 422,
      };
      return Response.json({ code }, { status: statuses[code] ?? 503 });
    }
  };
}
