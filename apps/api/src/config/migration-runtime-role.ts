import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function configureRuntimeRole(tx: Transaction, name: string, password: string) {
  // Compose interpolates the password into a URI. Limit it to URL-safe characters.
  if (
    !/^[a-z][a-z0-9_]{0,62}$/.test(name) ||
    name.startsWith("pg_") ||
    !/^[A-Za-z0-9._~-]{16,128}$/.test(password)
  )
    throw new Error("Invalid database runtime role");
  const role = sql.identifier(name);
  // Provision a SCRAM verifier so SQL statement logs never contain the password.
  const salt = randomBytes(16);
  const salted = pbkdf2Sync(password, salt, 4096, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest("base64");
  const serverKey = createHmac("sha256", salted).update("Server Key").digest("base64");
  const secret = sql.raw(
    `'SCRAM-SHA-256$4096:${salt.toString("base64")}$${storedKey}:${serverKey}'`,
  );
  const existing = await tx.execute<{ unsafe: boolean }>(sql`
    SELECT r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls
      OR pg_has_role(r.oid, current_user, 'MEMBER')
      OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid)
      OR EXISTS (SELECT 1 FROM pg_database WHERE datname = current_database() AND datdba = r.oid)
      OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'public' AND nspowner = r.oid)
      OR EXISTS (
        SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relowner = r.oid
      ) AS unsafe FROM pg_roles r WHERE r.rolname = ${name}
  `);
  if (existing[0]?.unsafe) throw new Error("Database runtime role has privileged access");
  if (existing.length === 0) {
    await tx.execute(
      sql`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${secret}`,
    );
  } else {
    await tx.execute(sql`ALTER ROLE ${role} LOGIN PASSWORD ${secret}`);
  }
  await tx.execute(sql`REVOKE CREATE ON SCHEMA public FROM ${role}`);
  const create = await tx.execute<{ allowed: boolean }>(
    sql`SELECT has_schema_privilege(${name}, 'public', 'CREATE') OR has_database_privilege(${name}, current_database(), 'CREATE') AS allowed`,
  );
  if (create[0]?.allowed !== false) throw new Error("Database runtime role can create objects");
  await tx.execute(sql`GRANT USAGE ON SCHEMA public TO ${role}`);
  const tables = await tx.execute<{ name: string }>(sql`
    SELECT tablename AS name FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'
  `);
  if (tables.length) {
    await tx.execute(sql`
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${sql.join(
        tables.map(({ name: table }) => sql`public.${sql.identifier(table)}`),
        sql`, `,
      )}
      TO ${role}
    `);
  }
  await tx.execute(sql`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  await tx.execute(sql`REVOKE ALL ON TABLE public.__drizzle_migrations FROM ${role}`);
}
