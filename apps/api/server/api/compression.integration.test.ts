import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { expect, it } from "vite-plus/test";
import { createApiClient } from "@voidmix/client";
it("decodes a compressed response once through real native fetch", async () => {
  const profile = { id: "account", email: "account@example.test", displayName: "A".repeat(2048) };
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip" });
    response.end(gzipSync(JSON.stringify({ json: profile })));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    const client = createApiClient({ baseUrl: `http://127.0.0.1:${address.port}` });
    expect(await client.account.get({})).toEqual(profile);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
