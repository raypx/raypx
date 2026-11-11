import { z } from "zod";
import {
  connectDaemon,
  daemonFetch,
  readDaemon,
  type ProfileOptions,
} from "../runtime/daemon/endpoint.ts";
import { profilePath } from "../runtime/state/index.ts";
import { LocalError } from "../runtime/errors.ts";

/** Finite native bootstrap; sensitive input is stdin-only and administrative tokens stay here. */
export async function bootstrapDesktop(options: ProfileOptions) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > 64 * 1024) throw new LocalError("INVALID_INPUT", "Desktop bootstrap exceeds limit");
    chunks.push(bytes);
  }
  let input: unknown;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new LocalError("INVALID_INPUT", "Invalid Desktop bootstrap");
  }
  const release = z.object({ action: z.literal("release") }).safeParse(input);
  const endpoint = release.success
    ? readDaemon(profilePath(options))
    : await connectDaemon(options);
  const response = await daemonFetch(endpoint, "/desktop", input, AbortSignal.timeout(30_000));
  if (!response.ok) throw new LocalError("HOST_UNAVAILABLE", "Desktop bootstrap unavailable");
  const envelope = z
    .object({
      result: z.unknown().optional(),
      error: z.object({ code: z.string().regex(/^[A-Z_]{1,128}$/) }).optional(),
    })
    .parse(await response.json());
  if (envelope.error) throw new LocalError(envelope.error.code, envelope.error.code);
  if (!Object.hasOwn(envelope, "result"))
    throw new LocalError("HOST_UNAVAILABLE", "Desktop bootstrap unavailable");
  console.log(JSON.stringify(envelope.result));
}
