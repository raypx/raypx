import { expect, it } from "vitest";
import { sandboxConfig } from "./config.js";
import { Engine } from "./engine.js";
import { verifyRuntime } from "./hosting.js";
const base = {
  SANDBOX_SUPERVISOR_TOKEN: "fixture-dedicated-token-with-32-characters",
  SANDBOX_COMPUTER_IMAGE: `sha256:${"a".repeat(64)}`,
};
const production = {
  ...base,
  SANDBOX_UNTRUSTED_TENANTS: "true",
  SANDBOX_RESTRICTED_EGRESS: "true",
  SANDBOX_HOST_RULES_APPLIED: "true",
};
function engine(extra: object = {}) {
  return new Engine(async () =>
    Response.json({
      Runtimes: {
        runc: {},
        runsc: { runtimeArgs: ["--oci-seccomp=true"] },
      },
      DefaultRuntime: "runc",
      SecurityOptions: ["name=seccomp,profile=builtin"],
      MemoryLimit: true,
      CpuCfsQuota: true,
      PidsLimit: true,
      ...extra,
    }),
  );
}
it("refuses missing runtimes, the default runtime for tenants, and missing resource enforcement", async () => {
  await expect(
    verifyRuntime(sandboxConfig({ ...base, SANDBOX_RUNTIME: "missing" }), engine()),
  ).rejects.toThrow("not installed");
  await expect(verifyRuntime(sandboxConfig(production), engine())).rejects.toThrow(
    "refuses the default",
  );
  await expect(
    verifyRuntime(
      sandboxConfig({ ...production, SANDBOX_ALLOW_DEFAULT_RUNTIME: "true" }),
      engine(),
    ),
  ).resolves.toBeUndefined();
  const config = sandboxConfig({ ...production, SANDBOX_RUNTIME: "runsc" });
  await expect(verifyRuntime(config, engine())).resolves.toBeUndefined();
  await expect(verifyRuntime(config, engine({ SecurityOptions: [] }))).rejects.toThrow(
    "enforcement",
  );
  await expect(verifyRuntime(config, engine({ PidsLimit: false }))).rejects.toThrow("enforcement");
  await expect(
    verifyRuntime(config, engine({ Runtimes: { runsc: { runtimeArgs: ["--network=host"] } } })),
  ).rejects.toThrow("Unsafe");
});
it("requires egress assertions and validates all abuse settings", () => {
  expect(() => sandboxConfig({ ...base, SANDBOX_UNTRUSTED_TENANTS: "true" })).toThrow(
    "restricted egress",
  );
  for (const key of [
    "SANDBOX_IDLE_MS",
    "SANDBOX_MAX_LIFETIME_MS",
    "SANDBOX_REAP_MS",
    "SANDBOX_HOME_BYTES",
    "SANDBOX_HOME_ENTRIES",
    "SANDBOX_SPACE_RUNNING",
    "SANDBOX_DEPLOYMENT_RUNNING",
    "SANDBOX_SPACE_STORAGE_BYTES",
    "SANDBOX_DEPLOYMENT_STORAGE_BYTES",
  ])
    for (const value of ["0", "-1", "1.5", "garbage"])
      expect(() => sandboxConfig({ ...base, [key]: value })).toThrow(key);
  expect(() => sandboxConfig({ ...base, SANDBOX_RUNTIME: "runsc --network=host" })).toThrow(
    "SANDBOX_RUNTIME",
  );
});
it("rejects unsafe runtime flags supplied as separate arguments", async () => {
  const config = sandboxConfig({ ...production, SANDBOX_RUNTIME: "runsc" });
  await expect(
    verifyRuntime(config, engine({ Runtimes: { runsc: { runtimeArgs: ["--network", "host"] } } })),
  ).rejects.toThrow("Unsafe");
});
it("requires OCI seccomp for untrusted runsc", async () => {
  await expect(
    verifyRuntime(
      sandboxConfig({ ...production, SANDBOX_RUNTIME: "runsc" }),
      engine({ Runtimes: { runsc: {} } }),
    ),
  ).rejects.toThrow("requires --oci-seccomp=true");
});
