import {
  enrollmentBeginSchema,
  enrollmentProof,
  instanceCheckProof,
  type InstanceBinding,
} from "@raypx/instances";
import { createInstanceSigner, instanceDigest, verifyProof } from "@raypx/instances/crypto";

// Only owned temporary profiles are passed by the native Go acceptance suite.
if (process.argv[2] === "cleanup") {
  const directory = process.argv[3];
  if (!directory) throw new Error("A temporary profile directory is required");
  if (
    (process.platform === "darwin" && !process.env.RAYPX_TEST_KEYCHAIN) ||
    process.platform === "win32"
  )
    await Bun.secrets.delete({ service: "pro.raypx.instance", name: instanceDigest(directory) });
} else {
  const signer = createInstanceSigner("native-instance-acceptance");
  const id = crypto.randomUUID();
  const token = crypto.randomUUID().replaceAll("-", "").repeat(2);
  let binding: InstanceBinding | undefined;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const { json: input } = (await request.json()) as { json: Record<string, unknown> };
      const method = new URL(request.url).pathname.split("/").at(-1);
      if (method === "begin") {
        const { proof, ...identity } = enrollmentBeginSchema.parse(input);
        if (!verifyProof(identity.publicKey, enrollmentProof(server.url.origin, identity), proof))
          return new Response(null, { status: 403 });
        binding = {
          ...identity,
          version: 1,
          origin: server.url.origin,
          accountId: "native-fixture-owner",
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
          instanceCheckProof(server.url.origin, binding.instanceId, input.timestamp),
          input.proof,
        )
      )
        return Response.json({ json: signer.issue(binding) });
      return new Response(null, { status: 403 });
    },
  });
  console.info(JSON.stringify({ origin: server.url.origin }));
}
