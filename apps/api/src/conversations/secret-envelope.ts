import { configurationCipher } from "../config/credentials.js";
import type { SealedSecret, SecretKeyProvider } from "./secret-types.js";

/** Uses the configuration center's APP_KEY/HKDF/AES-GCM mechanism to wrap data keys. */
export function applicationSecretKeyProvider(applicationKey: string): SecretKeyProvider {
  const cipher = configurationCipher(applicationKey, "model-connection-data-key-v1", "application");
  return {
    async wrap(dataKey, binding) {
      return { keyId: "application-v1", wrappedDataKey: await cipher.seal(dataKey, binding) };
    },
    async unwrap(key, binding) {
      if (key.keyId !== "application-v1") throw new Error("SECRET_UNAVAILABLE");
      return cipher.open(key.wrappedDataKey, binding);
    },
  };
}

/** The same envelope store protects connection and routine secrets. Callers persist only sealed values. */
export async function sealStoredSecret(
  keys: SecretKeyProvider,
  accountId: string,
  secretId: string,
  value: string,
): Promise<SealedSecret> {
  try {
    const binding = JSON.stringify([accountId, secretId]);
    const dataKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
    return {
      ...(await keys.wrap(dataKey, binding)),
      ciphertext: await configurationCipher(dataKey, "model-connection-value-v1", secretId).seal(
        value,
        binding,
      ),
    };
  } catch {
    throw new Error("SECRET_UNAVAILABLE");
  }
}

export async function openStoredSecret(
  keys: SecretKeyProvider,
  accountId: string,
  secretId: string,
  sealed: SealedSecret,
): Promise<string> {
  try {
    const binding = JSON.stringify([accountId, secretId]);
    const dataKey = await keys.unwrap(sealed, binding);
    return await configurationCipher(dataKey, "model-connection-value-v1", secretId).open(
      sealed.ciphertext,
      binding,
    );
  } catch {
    throw new Error("SECRET_UNAVAILABLE");
  }
}
