// Run with Node 24.18.0 against synthetic data only; this is a fixture authoring command.
import { generateKeyPairSync, sign } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
if (process.versions.node !== "24.18.0")
  throw new Error("Use Node 24.18.0 to author this baseline");
const here = dirname(fileURLToPath(import.meta.url));
const output = join(here, "node-baseline");
mkdirSync(output, { recursive: true });
rmSync(join(output, "profile.sqlite"), { force: true });
const client = new DatabaseSync(join(output, "profile.sqlite"));
const journal = JSON.parse(
  readFileSync(join(here, "../../../src/runtime/sqlite/migrations.generated.json"), "utf8"),
);
// This is the Node baseline's embedded-journal migrator, frozen at the recorded commit.
client.exec(
  "CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric, name text, applied_at TEXT)",
);
const count = Number(client.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get().n);
client.exec("BEGIN");
for (const entry of journal.slice(count)) {
  for (const sql of entry.sql.split("--> statement-breakpoint")) if (sql.trim()) client.exec(sql);
  client
    .prepare("INSERT INTO __drizzle_migrations (hash,created_at,name,applied_at) VALUES (?,?,?,?)")
    .run("", entry.timestamp, entry.name, new Date().toISOString());
}
client.exec("COMMIT");
client.prepare("ATTACH DATABASE ? AS synthetic").run(join(here, "baseline/profile.sqlite"));
for (const { name } of client
  .prepare(
    "SELECT name FROM synthetic.sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'",
  )
  .all()) {
  const identifier = '"' + name.replaceAll('"', '""') + '"';
  client.exec(`INSERT INTO main.${identifier} SELECT * FROM synthetic.${identifier}`);
}
client.exec("DETACH DATABASE synthetic");
client.exec("BEGIN IMMEDIATE");
client.prepare("INSERT INTO roots (id,value) VALUES (?,?)").run(
  "00000000-0000-4000-8000-000000000099",
  JSON.stringify({
    id: "00000000-0000-4000-8000-000000000099",
    name: "Node 合成 profile",
    path: "/synthetic/node-profile",
    createdAt: "2026-11-06T00:00:00.000Z",
  }),
);
const device = generateKeyPairSync("ed25519");
const issuer = generateKeyPairSync("ed25519");
const binding = {
  instanceId: "00000000-0000-4000-8000-000000000077",
  publicKey: device.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  name: "Synthetic Node baseline",
  platform: "fixture",
  appVersion: "0.1.0",
  version: 1,
  origin: "https://fixture.invalid",
  accountId: "synthetic-owner",
  revision: 1,
  status: "registered",
  issuedAt: "2026-11-06T00:00:00.000Z",
};
client
  .prepare("INSERT INTO instance_credentials (instance_id,private_key) VALUES (?,?)")
  .run(binding.instanceId, device.privateKey.export({ type: "pkcs8", format: "der" }));
writeFileSync(join(output, "instance-id"), binding.instanceId, { mode: 0o600 });
writeFileSync(
  join(output, "instance.json"),
  JSON.stringify({
    binding,
    signature: sign(null, Buffer.from(JSON.stringify(binding)), issuer.privateKey).toString(
      "base64",
    ),
    issuerKey: issuer.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  }),
  { mode: 0o600 },
);
client
  .prepare(
    "INSERT INTO host_authorizations (api_url,account_id,device_id,epoch,authorization) VALUES (?,?,?,?,?)",
  )
  .run(
    "https://fixture.invalid",
    "synthetic-owner",
    "synthetic-device",
    1,
    "FAKE-NON-USABLE-HOST-AUTHORIZATION",
  );
client.exec("COMMIT");
client.close();
writeFileSync(
  join(output, "provenance.json"),
  JSON.stringify(
    {
      node: process.versions.node,
      baselineCommit: "986f58d5531c159f24da97ed532442bc0071ed82",
      synthetic: true,
      migrations: journal.map((entry) => entry.name),
    },
    null,
    2,
  ) + "\n",
);
