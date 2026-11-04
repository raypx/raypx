import { resolve } from "node:path";
import { profilePath } from "../../src/runtime/state";
import {
  enrollmentBeginSchema,
  enrollmentProof,
  instanceCheckProof,
  type InstanceBinding,
} from "@raypx/instances";
import { createInstanceSigner, instanceDigest, verifyProof } from "@raypx/instances/crypto";

/** Enroll an owned temporary profile over HTTP; exercise production identity/key storage. */
export async function enrollTestProfile(
  options: { dataDir: string; profile?: string },
  launch: string[] = [process.execPath, resolve(import.meta.dirname, "../../src/main.ts")],
) {
  const directory = profilePath(options);
  const signer = createInstanceSigner("isolated-packaged-acceptance");
  const token = crypto.randomUUID().replaceAll("-", "").repeat(2);
  const id = crypto.randomUUID();
  let binding: InstanceBinding | undefined;
  let stage = "before begin";
  const keyId = instanceDigest(directory);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request): Promise<Response> {
      const input = (await request.json()) as { json: Record<string, unknown> };
      const value = input.json,
        method = new URL(request.url).pathname.split("/").at(-1);
      if (method === "begin") {
        stage = "begin received";
        const { proof, ...identity } = enrollmentBeginSchema.parse(value);
        if (!verifyProof(identity.publicKey, enrollmentProof(server.url.origin, identity), proof))
          return new Response(null, { status: 403 });
        binding = {
          ...identity,
          version: 1,
          origin: server.url.origin,
          accountId: "fixture-owner",
          revision: 1,
          status: "registered",
          issuedAt: new Date().toISOString(),
        };
        return Response.json({
          json: {
            id,
            token,
            code: "ABCDEFGH23",
            issuerKey: signer.publicKey,
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
          },
        });
      }
      if (method === "poll" && binding && value.id === id && value.token === token) {
        stage = "poll received";
        return Response.json({ json: { status: "approved", receipt: signer.issue(binding) } });
      }
      if (
        method === "check" &&
        binding &&
        value.instanceId === binding.instanceId &&
        typeof value.timestamp === "number" &&
        typeof value.proof === "string" &&
        verifyProof(
          binding.publicKey,
          instanceCheckProof(server.url.origin, binding.instanceId, value.timestamp),
          value.proof,
        )
      )
        return Response.json({ json: signer.issue(binding) });
      return new Response(null, { status: 403 });
    },
  });
  const close = async () => {
    await server.stop(true);
  };
  try {
    // Enroll with the executable under test; credentials stay in this temporary profile.
    const child = Bun.spawn(
      [
        ...launch,
        "login",
        "--data-dir",
        options.dataDir,
        "--profile",
        options.profile ?? "default",
      ],
      {
        env: { ...process.env, RAYPX_API_URL: server.url.origin, RAYPX_WEB_URL: server.url.origin },
        stdout: "ignore",
        stderr: "pipe",
        windowsHide: true,
      },
    );
    const timer = setTimeout(() => child.kill(), 30_000);
    try {
      const [code, diagnostics] = await Promise.all([
        child.exited,
        new Response(child.stderr).text(),
      ]);
      let phase = "not-started",
        scope = "unknown-slot";
      for (const line of diagnostics.split("\n")) {
        try {
          const event = JSON.parse(line);
          if (
            event.operation === "instance.enrollment" &&
            /^(starting|key-read|key-write|key-ready|request|approval|registered)$/.test(
              event.status,
            )
          ) {
            phase = event.status;
            scope = event.id === keyId ? "same-slot" : "different-slot";
          }
        } catch {
          /* Ignore non-diagnostic output; never echo it. */
        }
      }
      if (code !== 0)
        throw new Error(
          "Test instance enrollment failed (" + stage + "; " + phase + "; " + scope + ")",
        );
    } finally {
      clearTimeout(timer);
    }
    return close;
  } catch (error) {
    await close();
    throw error;
  }
}
