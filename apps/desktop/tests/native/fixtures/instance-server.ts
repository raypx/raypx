import { fileURLToPath as entryFile } from "node:url";
import { resolve as entryPath } from "node:path";
import { serveHttp } from "@raypx/runtime-node/http";
import {
  enrollmentBeginSchema,
  enrollmentProof,
  instanceCheckProof,
  type InstanceBinding,
} from "@raypx/instances";
import { createInstanceSigner, verifyProof } from "@raypx/instances/crypto";

/**
 * Auto-approving instance API for owned temporary profiles only. A new fixture
 * knows no earlier binding, so checks fail and the profile works offline.
 */
export function instanceFixture(origin: string, accountId: string) {
  const signer = createInstanceSigner("native-instance-acceptance");
  const id = crypto.randomUUID();
  const token = crypto.randomUUID().replaceAll("-", "").repeat(2);
  let binding: InstanceBinding | undefined;
  return async (request: Request) => {
    const { json: input } = (await request.json()) as { json: Record<string, unknown> };
    const method = new URL(request.url).pathname.split("/").at(-1);
    if (method === "begin") {
      const { proof, ...identity } = enrollmentBeginSchema.parse(input);
      if (!verifyProof(identity.publicKey, enrollmentProof(origin, identity), proof))
        return new Response(null, { status: 403 });
      binding = {
        ...identity,
        version: 1,
        origin,
        accountId,
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
    if (method === "poll" && binding && input.id === id && input.token === token)
      return Response.json({ json: { status: "approved", receipt: signer.issue(binding) } });
    if (
      method === "check" &&
      binding &&
      input.instanceId === binding.instanceId &&
      typeof input.timestamp === "number" &&
      typeof input.proof === "string" &&
      verifyProof(
        binding.publicKey,
        instanceCheckProof(origin, binding.instanceId, input.timestamp),
        input.proof,
      )
    )
      return Response.json({ json: signer.issue(binding) });
    return new Response(null, { status: 403 });
  };
}

// The native Go acceptance suite runs this file and reads the printed origin.
if (process.argv[1] !== undefined && entryPath(process.argv[1]) === entryFile(import.meta.url)) {
  const server = await serveHttp({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => handle(request),
  });
  const handle = instanceFixture(server.url.origin, "native-fixture-owner");
  console.info(JSON.stringify({ origin: server.url.origin }));
}
