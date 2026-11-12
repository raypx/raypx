import { afterEach, expect, it } from "vitest";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInstanceKey, createInstanceSigner } from "@raypx/instances/crypto";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import { ProfileStorage } from "../../../src/runtime/sqlite/index.js";
import { instanceKeys } from "../../../src/runtime/instances/keys.js";
import { InstanceRuntime } from "../../../src/runtime/instances/index.js";
import { createHostVault, type HostBinding } from "../../../src/runtime/daemon/vault.js";
import { hostAuthorizations } from "../../../src/runtime/sqlite/schema/credentials.js";
import { createRuntime } from "../../../src/runtime/index.js";
import { profilePath } from "../../../src/runtime/state/index.js";
import { errorPayload } from "../../../src/runtime/errors.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0).reverse()) close();
});
function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "raypx-credentials-"));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function storage(directory: string) {
  const value = new ProfileStorage(directory);
  cleanups.push(() => value.close());
  return value;
}
const binding: HostBinding = {
  apiUrl: "https://api.example.test",
  accountId: "account",
  deviceId: "eafca365-18bc-4f74-93eb-84bd717b4494",
  epoch: 1,
  expiresAt: "2099-01-01T00:00:00.000Z",
};
const authorization = {
  accountId: binding.accountId,
  deviceId: binding.deviceId,
  epoch: binding.epoch,
  expiresAt: binding.expiresAt,
  credential: "k".repeat(64),
};

it("restores credentials in another process and isolates every host binding dimension", async () => {
  const root = temporaryDirectory(),
    db = storage(root),
    pair = createInstanceKey(),
    id = crypto.randomUUID();
  await instanceKeys(db.database).set(id, pair.privateKey);
  const vault = createHostVault(db.database);
  expect(await vault.set(binding, authorization)).toBe(true);
  for (const other of [
    { ...binding, apiUrl: "https://other.example.test" },
    { ...binding, accountId: "other" },
    { ...binding, deviceId: crypto.randomUUID() },
    { ...binding, epoch: 2 },
    { ...binding, expiresAt: "2098-01-01T00:00:00.000Z" },
  ])
    expect(await vault.get(other)).toBeUndefined();
  db.close();
  const script = `
    import { ProfileStorage } from ${JSON.stringify(resolve(import.meta.dirname, "../../../src/runtime/sqlite"))};
    import { instanceKeys } from ${JSON.stringify(resolve(import.meta.dirname, "../../../src/runtime/instances/keys"))};
    import { createHostVault } from ${JSON.stringify(resolve(import.meta.dirname, "../../../src/runtime/daemon/vault"))};
    import { signProof, verifyProof } from "@raypx/instances/crypto";
    const db = new ProfileStorage(process.argv[1]);
    try {
      const key = await instanceKeys(db.database).get(process.argv[2]);
      const host = await createHostVault(db.database).get(JSON.parse(process.argv[4]));
      console.log(JSON.stringify({ identity: Boolean(key && verifyProof(process.argv[3], "test", signProof(key, "test"))), host: host?.credential === "k".repeat(64) }));
    } finally { db.close(); }
  `;
  const child = Bun.spawn(
    [process.execPath, "-e", script, root, id, pair.publicKey, JSON.stringify(binding)],
    {
      cwd: resolve(import.meta.dirname, "../../.."),
      stdout: "pipe",
      stderr: "ignore",
    },
  );
  expect(await child.exited).toBe(0);
  expect(JSON.parse(await new Response(child.stdout).text())).toEqual({
    identity: true,
    host: true,
  });
  const reopened = storage(root),
    restored = createHostVault(reopened.database);
  const other = { ...binding, epoch: 2 };
  await restored.set(other, { ...authorization, epoch: 2 });
  await restored.remove(binding);
  expect(await restored.get(binding)).toBeUndefined();
  expect(await restored.get(other)).toEqual({ ...authorization, epoch: 2 });
  expect(await instanceKeys(reopened.database).get(id)).toBe(pair.privateKey);
});

it("reports failed writes, preserves key identity, and explicitly marks memory-only grants", async () => {
  const db = storage(temporaryDirectory()),
    pair = createInstanceKey(),
    id = crypto.randomUUID();
  const keys = instanceKeys(db.database),
    vault = createHostVault(db.database);
  await keys.set(id, pair.privateKey);
  await expect(keys.set(id, createInstanceKey().privateKey)).rejects.toMatchObject({
    code: "INSTANCE_KEY_UNAVAILABLE",
  });
  expect(await keys.get(id)).toBe(pair.privateKey);
  const failure = await keys
    .set(crypto.randomUUID(), Buffer.alloc(5000, 1).toString("base64"))
    .catch((error: unknown) => errorPayload(error));
  expect(failure).toMatchObject({ code: "INSTANCE_KEY_UNAVAILABLE" });
  expect(JSON.stringify(failure)).not.toContain("INSERT");
  db.database.$client.exec("PRAGMA query_only=ON");
  await expect(keys.set(crypto.randomUUID(), pair.privateKey)).rejects.toThrow(/./);
  expect(await vault.set(binding, authorization)).toBe(false);
  expect(await vault.get(binding)).toEqual(authorization);
  expect(await createHostVault(db.database).get(binding)).toBeUndefined();
  await expect(vault.remove(binding)).rejects.toThrow(/./);
  db.database.$client.exec("PRAGMA query_only=OFF");
  await vault.remove(binding);
  expect(await vault.get(binding)).toBeUndefined();
  expect(db.database.select().from(hostAuthorizations).all()).toEqual([]);
});

it("rejects persisted authorization content outside its binding", async () => {
  const db = storage(temporaryDirectory());
  db.database
    .insert(hostAuthorizations)
    .values({
      ...binding,
      authorization: JSON.stringify({ ...authorization, accountId: "another" }),
    })
    .run();
  expect(await createHostVault(db.database).get(binding)).toBeUndefined();
  await expect(
    createHostVault(db.database).set(binding, { ...authorization, epoch: 2 }),
  ).rejects.toThrow(/./);
});

it("keeps an old profile unavailable without importing or replacing its key or history", async () => {
  const dataDir = temporaryDirectory(),
    root = profilePath({ dataDir }),
    db = storage(root);
  const pair = createInstanceKey(),
    id = crypto.randomUUID();
  const receipt = createInstanceSigner("old-profile").issue({
    version: 1,
    instanceId: id,
    publicKey: pair.publicKey,
    origin: binding.apiUrl,
    accountId: binding.accountId,
    name: "Original",
    platform: "test",
    appVersion: "0.1.0",
    revision: 1,
    status: "registered",
    issuedAt: new Date().toISOString(),
  });
  const original = JSON.stringify(receipt);
  writeFileSync(join(root, "instance.json"), original);
  writeFileSync(join(root, "instance.key"), Buffer.from(pair.privateKey, "base64"));
  const runtime = new InstanceRuntime(root, { keys: instanceKeys(db.database) });
  expect(await runtime.status()).toEqual({ state: "unavailable" });
  await expect(runtime.begin(binding.apiUrl)).rejects.toMatchObject({
    code: "INSTANCE_KEY_UNAVAILABLE",
  });
  expect(await instanceKeys(db.database).get(id)).toBeUndefined();
  expect(readFileSync(join(root, "instance.json"), "utf8")).toBe(original);
  expect(readFileSync(join(root, "instance.key")).toString("base64")).toBe(pair.privateKey);
});

it("does not generate replacement keys for an existing instance ID without a receipt", async () => {
  const root = temporaryDirectory(),
    db = storage(root),
    id = crypto.randomUUID();
  writeFileSync(join(root, "instance-id"), id, { mode: 0o600 });
  const runtime = new InstanceRuntime(root, { keys: instanceKeys(db.database) });
  expect(await runtime.status()).toEqual({ state: "unavailable" });
  await expect(runtime.begin(binding.apiUrl)).rejects.toMatchObject({
    code: "INSTANCE_KEY_UNAVAILABLE",
  });
  expect(await instanceKeys(db.database).get(id)).toBeUndefined();
  expect(readFileSync(join(root, "instance-id"), "utf8")).toBe(id);
});

it.skipIf(process.platform !== "win32")(
  "restricts Windows directory, database and auxiliary DACLs",
  () => {
    const root = temporaryDirectory(),
      db = storage(root);
    db.database.$client.exec("BEGIN IMMEDIATE");
    try {
      const script = String.raw`
      $ErrorActionPreference = 'Stop'
      $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
      $root = $env:RAYPX_ACL_TEST_DIRECTORY
      $ok = $true
      foreach ($path in @($root, (Join-Path $root 'profile.sqlite'), (Join-Path $root 'profile.sqlite-wal'), (Join-Path $root 'profile.sqlite-shm'))) {
        $acl = Get-Acl -LiteralPath $path
        if ($acl.Owner -ne [System.Security.Principal.WindowsIdentity]::GetCurrent().Name) { $ok = $false }
        foreach ($access in $acl.Access) {
          $principal = $access.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
          if ($principal -ne $sid -and $principal -ne 'S-1-5-18') { $ok = $false }
          if ($access.AccessControlType -ne 'Allow') { $ok = $false }
        }
      }
      if (!(Get-Acl -LiteralPath $root).AreAccessRulesProtected) { $ok = $false }
      Write-Output ($ok | ConvertTo-Json -Compress)
    `;
      const result = Bun.spawnSync({
        cmd: [
          join(process.env.SystemRoot!, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(script, "utf16le").toString("base64"),
        ],
        env: { ...process.env, RAYPX_ACL_TEST_DIRECTORY: root },
        stderr: "ignore",
        timeout: 15_000,
      });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout.toString().trim())).toBe(true);
    } finally {
      db.database.$client.exec("ROLLBACK");
    }
  },
);

it("keeps the instance key and grants after local history clearing and profile shutdown", async () => {
  const dataDir = temporaryDirectory(),
    runtime = createRuntime({
      dataDir,
      instanceAccess: { assert: async () => {}, status: async () => ({ state: "registered" }) },
    });
  const pair = createInstanceKey(),
    id = crypto.randomUUID();
  try {
    await instanceKeys(runtime.state.db).set(id, pair.privateKey);
    await createHostVault(runtime.state.db).set(binding, authorization);
    await runtime.request("agents.local.clear", { accountId: LOCAL_WORKSPACE_ID });
    expect(await instanceKeys(runtime.state.db).get(id)).toBe(pair.privateKey);
  } finally {
    await runtime.close();
  }
  await expect(instanceKeys(runtime.state.db).get(id)).rejects.toThrow(/./);
  const reopened = storage(profilePath({ dataDir }));
  expect(await instanceKeys(reopened.database).get(id)).toBe(pair.privateKey);
  expect(await createHostVault(reopened.database).get(binding)).toEqual(authorization);
});

it("rejects corrupt credential databases instead of silently replacing them", () => {
  const root = temporaryDirectory();
  writeFileSync(join(root, "profile.sqlite"), "not a database");
  expect(() => new ProfileStorage(root)).toThrow(/./);
  expect(readFileSync(join(root, "profile.sqlite"), "utf8")).toBe("not a database");
});

it.skipIf(process.platform === "win32")(
  "protects database auxiliaries and rejects symbolic links",
  () => {
    const root = temporaryDirectory(),
      db = storage(root);
    db.database.$client.exec("BEGIN IMMEDIATE");
    for (const name of ["", "-wal", "-shm"])
      expect(statSync(join(root, `profile.sqlite${name}`)).mode & 0o777).toBe(0o600);
    db.database.$client.exec("ROLLBACK");
    expect(statSync(root).mode & 0o777).toBe(0o700);
    db.close();
    chmodSync(root, 0o755);
    const reopened = storage(root);
    expect(statSync(root).mode & 0o777).toBe(0o700);
    reopened.close();
    const linked = temporaryDirectory();
    symlinkSync(join(root, "profile.sqlite"), join(linked, "profile.sqlite"));
    expect(() => new ProfileStorage(linked)).toThrow(/regular/);
  },
);
