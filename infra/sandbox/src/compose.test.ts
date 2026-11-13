import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

interface Service {
  profiles?: string[];
  image?: string;
  build?: { context: string; dockerfile: string; args: Record<string, string> };
  environment?: Record<string, string>;
  networks?: Record<string, { ipv4_address: string }> | string[];
  ports?: unknown[];
  volumes?: (string | { type: string; source: string; target: string })[];
}

it("keeps the optional Compose supervisor buildable and its Engine socket private", async () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const source = await readFile(resolve(root, "deploy/compose.yaml"), "utf8");
  const template = await readFile(resolve(root, "deploy/.env.example"), "utf8");
  const compose = Bun.YAML.parse(source) as {
    services: Record<string, Service>;
    volumes: Record<string, unknown>;
    networks: Record<string, { internal?: boolean }>;
  };
  const supervisor = compose.services.sandbox!;
  expect(supervisor.profiles).toEqual(["sandbox"]);
  expect(supervisor.image).toBe("raypx/sandbox:${COMPOSE_PROJECT_NAME:?}-${RAYPX_RELEASE:?}");
  expect(supervisor.build).toEqual({
    context: "..",
    dockerfile: "infra/sandbox/Dockerfile",
    args: { BUN_IMAGE_DIGEST: "${BUN_IMAGE_DIGEST:-}" },
  });
  expect(
    await readFile(
      resolve(root, "deploy", supervisor.build!.context, supervisor.build!.dockerfile),
      "utf8",
    ),
  ).toContain("FROM oven/bun:");
  expect(supervisor.ports ?? []).toEqual([]);
  expect(supervisor.environment?.SANDBOX_ENGINE_SOCKET).toBe("/var/run/docker.sock");
  expect(supervisor.volumes).toContainEqual({
    type: "bind",
    source: "${SANDBOX_ENGINE_SOCKET:-/var/run/docker.sock}",
    target: "/var/run/docker.sock",
  });
  expect(supervisor.volumes).toContain("sandbox-state:/var/lib/raypx-sandbox");
  expect(compose.volumes).toHaveProperty("sandbox-state");
  expect(compose.networks["sandbox-control"]?.internal).toBe(true);
  expect(supervisor.networks).toEqual({
    "sandbox-control": { ipv4_address: "${SANDBOX_LISTEN_ADDRESS:-172.30.40.2}" },
  });
  expect(supervisor.environment?.SANDBOX_LISTEN_ADDRESS).toBe(
    "${SANDBOX_LISTEN_ADDRESS:-172.30.40.2}",
  );
  for (const [name, service] of Object.entries(compose.services)) {
    if (name === "sandbox") continue;
    expect(JSON.stringify(service.volumes ?? [])).not.toMatch(/docker\.sock|ENGINE_SOCKET/);
    expect(service.environment ?? {}).not.toHaveProperty("SANDBOX_ENGINE_SOCKET");
  }
  expect(template).toMatch(/^BUN_IMAGE_DIGEST=$/m);
  expect(template).toMatch(/^SANDBOX_ENGINE_SOCKET=\/var\/run\/docker\.sock$/m);
});
