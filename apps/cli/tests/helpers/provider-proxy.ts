import assert from "node:assert/strict";
import { createServer as httpServer } from "node:http";
import { createServer as httpsServer } from "node:https";
import { connect, type AddressInfo, type Socket } from "node:net";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { findExecutable } from "@raypx/runtime-node/process";

const hosts = [
  "api.anthropic.com",
  "api.openai.com",
  "generativelanguage.googleapis.com",
  "openrouter.ai",
];

// Windows Firewall accepts subnet filters reliably. Leave only IPv4 loopback for
// the explicit 127.0.0.1 proxy; provider processes need no IPv6 connectivity.
export const windowsProviderBlockedSubnets = [
  "0.0.0.0/2",
  "64.0.0.0/3",
  "96.0.0.0/4",
  "112.0.0.0/5",
  "120.0.0.0/6",
  "124.0.0.0/7",
  "126.0.0.0/8",
  "128.0.0.0/1",
  "::/0",
] as const;

/** A local TLS endpoint reached through CONNECT. It never forwards traffic to the Internet. */
export async function providerProxy(directory: string) {
  const openssl = findExecutable("openssl");
  assert.ok(openssl, "openssl is required for the temporary provider CA");
  const cert = join(directory, "provider-ca.pem"),
    key = join(directory, "provider-key.pem");
  const certificateProcess = Bun.spawn(
    [
      openssl,
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      "/CN=Raypx synthetic provider test",
      "-addext",
      "subjectAltName=" + hosts.map((host) => "DNS:" + host).join(","),
      "-keyout",
      basename(key),
      "-out",
      basename(cert),
    ],
    { cwd: directory, stdout: "ignore", stderr: "pipe" },
  );
  const certificateError = await new Response(certificateProcess.stderr).text();
  assert.equal(
    await certificateProcess.exited,
    0,
    `Could not create the provider test CA: ${certificateError.trim().slice(-4096)}`,
  );
  const sockets = new Set<Socket>();
  const track = (socket: Socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  };
  const requests: { host: string; body: string; credential: string }[] = [];
  const tls = httpsServer(
    { key: await readFile(key), cert: await readFile(cert) },
    async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      requests.push({
        host: request.headers.host ?? "",
        body,
        credential: String(
          request.headers.authorization ??
            request.headers["x-api-key"] ??
            request.headers["x-goog-api-key"] ??
            request.url,
        ),
      });
      response.writeHead(401, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          error: {
            code: 401,
            message: "synthetic-smoke-key private-provider-prompt",
            status: "UNAUTHENTICATED",
            type: "authentication_error",
          },
        }),
      );
    },
  );
  tls.on("connection", track);
  await new Promise<void>((resolve) => tls.listen(0, "127.0.0.1", resolve));
  const proxy = httpServer((_request, response) => {
    response.writeHead(403);
    response.end();
  });
  proxy.on("connection", track);
  proxy.on("connect", (request, socket, head) => {
    if (!hosts.includes((request.url ?? "").replace(/:443$/, ""))) {
      socket.destroy();
      return;
    }
    const upstream = connect((tls.address() as AddressInfo).port, "127.0.0.1", () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    track(upstream);
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
    socket.on("close", () => upstream.destroy());
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  const sandbox = join(directory, "provider.sb");
  await writeFile(
    sandbox,
    '(version 1) (allow default) (deny network-outbound) (allow network-outbound (remote ip "localhost:*"))',
  );
  let cleanupNetwork = async () => {};
  let isolatedBinary: string | undefined;
  async function powershell(script: string, binary: string, rule: string) {
    const child = Bun.spawn(
      [
        join(process.env.SystemRoot!, "System32/WindowsPowerShell/v1.0/powershell.exe"),
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='Stop'; " + script,
      ],
      {
        env: { ...process.env, RAYPX_TEST_PROGRAM: binary, RAYPX_TEST_FIREWALL_RULE: rule },
        stdout: "ignore",
        stderr: "pipe",
      },
    );
    const error = await new Response(child.stderr).text();
    assert.equal(
      await child.exited,
      0,
      `Could not configure loopback-only provider egress: ${error.trim().slice(-4096)}`,
    );
  }
  return {
    requests,
    cert,
    url,
    async isolate(binary: string) {
      if (process.platform === "win32") {
        const rule = "raypx-provider-" + crypto.randomUUID();
        await powershell(
          `New-NetFirewallRule -Name $env:RAYPX_TEST_FIREWALL_RULE -DisplayName $env:RAYPX_TEST_FIREWALL_RULE -Direction Outbound -Action Block -Program $env:RAYPX_TEST_PROGRAM -RemoteAddress @(${windowsProviderBlockedSubnets.map((subnet) => `'${subnet}'`).join(",")}) | Out-Null`,
          binary,
          rule,
        );
        cleanupNetwork = () =>
          powershell("Remove-NetFirewallRule -Name $env:RAYPX_TEST_FIREWALL_RULE", binary, rule);
      } else if (process.platform === "linux") {
        assert.deepEqual(
          (await readdir("/sys/class/net")).sort(),
          ["lo"],
          "Linux provider acceptance requires a network namespace with only loopback (for example Docker --network none)",
        );
      } else if (process.platform !== "darwin") {
        throw new Error(
          "Provider artifact acceptance requires the macOS sandbox or Windows firewall runner",
        );
      }
      isolatedBinary = binary;
    },
    command(binary: string, args: string[]) {
      if (process.platform === "darwin")
        return ["/usr/bin/sandbox-exec", "-f", sandbox, binary, ...args];
      assert.equal(isolatedBinary, binary, "Provider binary must have loopback-only egress");
      return [binary, ...args];
    },
    async close() {
      try {
        await cleanupNetwork();
      } finally {
        for (const socket of sockets) socket.destroy();
        proxy.closeAllConnections();
        tls.closeAllConnections();
        await Promise.all([
          new Promise<void>((resolve) => proxy.close(() => resolve())),
          new Promise<void>((resolve) => tls.close(() => resolve())),
        ]);
      }
    },
  };
}
