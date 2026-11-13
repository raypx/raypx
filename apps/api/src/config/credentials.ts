const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const ivLength = 12;

export function configurationCipher(secret: string, purpose: string, id: string) {
  async function encryptionKey() {
    const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, [
      "deriveKey",
    ]);
    return crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: encoder.encode(purpose), info: encoder.encode(id) },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }
  return {
    async seal(cleartext: string, associatedData: string) {
      const iv = crypto.getRandomValues(new Uint8Array(ivLength));
      const sealed = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: encoder.encode(associatedData) },
        await encryptionKey(),
        encoder.encode(cleartext),
      );
      return Buffer.concat([iv, new Uint8Array(sealed)]).toString("base64");
    },
    async open(ciphertext: string, associatedData: string) {
      const bytes = Uint8Array.from(Buffer.from(ciphertext, "base64"));
      const cleartext = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: bytes.subarray(0, ivLength),
          additionalData: encoder.encode(associatedData),
        },
        await encryptionKey(),
        bytes.subarray(ivLength),
      );
      return decoder.decode(cleartext);
    },
  };
}
