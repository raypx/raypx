import { expect, it, vi } from "vitest";
import type { Database } from "@raypx/database/connection";
import {
  applicationSecretKeyProvider,
  createPostgresSecretStore,
  type SealedSecret,
  type SecretKeyProvider,
} from "./secrets.js";

const applicationKey = "synthetic-application-key-for-secrets-tests-32-characters";
const credential = "connection-credential-private-fixture-never-public";
function databaseFixture() {
  let selected:
    | (SealedSecret & { id: string; accountId: string; connectionId: string })
    | undefined;
  const limit = vi.fn(async () => (selected ? [selected] : []));
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const db = { select } as unknown as Database;
  return {
    db,
    select,
    limit,
    store: (value: typeof selected) => {
      selected = value;
    },
  };
}

it("constructs without database I/O and encrypts values with wrapped independent data keys", async () => {
  const f = databaseFixture();
  const keys = applicationSecretKeyProvider(applicationKey);
  const wrap = vi.spyOn(keys, "wrap");
  const store = createPostgresSecretStore(f.db, keys);
  expect(f.select).not.toHaveBeenCalled();
  const first = await store.seal("owner", "secret-a", credential);
  const second = await store.seal("owner", "secret-a", credential);
  expect(first.ciphertext).not.toBe(second.ciphertext);
  expect(first.wrappedDataKey).not.toBe(second.wrappedDataKey);
  expect(first.keyId).toBe("application-v1");
  expect(f.select).not.toHaveBeenCalled();
  expect(JSON.stringify([first, second])).not.toContain(credential);
  const dataKey = wrap.mock.calls[0]![0];
  expect(JSON.stringify(first)).not.toContain(dataKey);
  f.store({ ...first, id: "secret-a", accountId: "owner", connectionId: "connection" });
  await expect(store.read("owner", "connection", "secret-a")).resolves.toBe(credential);
  await expect(store.read("other", "connection", "secret-a")).rejects.toThrow("SECRET_UNAVAILABLE");
  await expect(store.read("owner", "connection", "different-secret")).rejects.toThrow(
    "SECRET_UNAVAILABLE",
  );
});

it("rejects missing secrets, wrong wrapping keys and modified ciphertext with only a stable error", async () => {
  const f = databaseFixture();
  const store = createPostgresSecretStore(f.db, applicationSecretKeyProvider(applicationKey));
  await expect(store.read("owner", "connection", "secret")).rejects.toThrow("SECRET_UNAVAILABLE");
  const sealed = await store.seal("owner", "secret", credential);
  f.store({ ...sealed, id: "secret", accountId: "owner", connectionId: "connection" });
  const wrongKey = createPostgresSecretStore(
    f.db,
    applicationSecretKeyProvider(`${applicationKey}-different`),
  );
  await expect(wrongKey.read("owner", "connection", "secret")).rejects.toThrow(
    "SECRET_UNAVAILABLE",
  );
  f.store({
    ...sealed,
    ciphertext: `${sealed.ciphertext.slice(0, 5)}broken`,
    id: "secret",
    accountId: "owner",
    connectionId: "connection",
  });
  await expect(store.read("owner", "connection", "secret")).rejects.toThrow("SECRET_UNAVAILABLE");
  const failingKeys: SecretKeyProvider = {
    wrap: async () => {
      throw new Error("Unused");
    },
    unwrap: async () => {
      throw new Error(`key service leaked ${credential}`);
    },
  };
  const unavailable = createPostgresSecretStore(f.db, failingKeys);
  const failure = await unavailable
    .read("owner", "connection", "secret")
    .catch((error: unknown) => error);
  expect(failure).toMatchObject({ message: "SECRET_UNAVAILABLE" });
  expect(String(failure)).not.toContain(credential);
  expect(JSON.stringify(failure)).not.toContain(credential);
});

it("binds wrapped keys to the owner/secret and allows rewrapping without rewriting ciphertext", async () => {
  const f = databaseFixture();
  const oldKeys = applicationSecretKeyProvider(applicationKey);
  const newKeys = applicationSecretKeyProvider(`${applicationKey}-rotated`);
  const store = createPostgresSecretStore(f.db, oldKeys);
  const sealed = await store.seal("owner", "secret", credential);
  const binding = JSON.stringify(["owner", "secret"]);
  const dataKey = await oldKeys.unwrap(sealed, binding);
  await expect(oldKeys.unwrap(sealed, JSON.stringify(["other", "secret"]))).rejects.toBeInstanceOf(
    Error,
  );
  await expect(oldKeys.unwrap({ ...sealed, keyId: "unsupported" }, binding)).rejects.toThrow(
    "SECRET_UNAVAILABLE",
  );
  const rewrapped = { ...sealed, ...(await newKeys.wrap(dataKey, binding)) };
  expect(rewrapped.ciphertext).toBe(sealed.ciphertext);
  expect(rewrapped.wrappedDataKey).not.toBe(sealed.wrappedDataKey);
  f.store({ ...rewrapped, id: "secret", accountId: "owner", connectionId: "connection" });
  await expect(
    createPostgresSecretStore(f.db, newKeys).read("owner", "connection", "secret"),
  ).resolves.toBe(credential);
  expect(JSON.stringify(rewrapped)).not.toContain(credential);
});
