import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import {
  receiptPayload,
  instanceReceiptSchema,
  InstanceError,
  type InstanceBinding,
  type InstanceReceipt,
} from "./index.ts";
export function createInstanceKey() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  };
}
export function signProof(privateKey: string, value: string) {
  return sign(
    null,
    Buffer.from(value),
    createPrivateKey({ key: Buffer.from(privateKey, "base64"), type: "pkcs8", format: "der" }),
  ).toString("base64");
}
export function verifyProof(publicKey: string, value: string, signature: string) {
  try {
    return verify(
      null,
      Buffer.from(value),
      createPublicKey({ key: Buffer.from(publicKey, "base64"), type: "spki", format: "der" }),
      Buffer.from(signature, "base64"),
    );
  } catch {
    return false;
  }
}
export function createInstanceSigner(secret: string) {
  const seed = createHash("sha256")
    .update("raypx-instance-signing-v1\0" + secret)
    .digest();
  const privateKey = createPrivateKey({
    key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]),
    format: "der",
    type: "pkcs8",
  });
  const encoded = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  const publicKey = createPublicKey(privateKey)
    .export({ type: "spki", format: "der" })
    .toString("base64");
  return {
    publicKey,
    issue(binding: InstanceBinding): InstanceReceipt {
      return {
        binding,
        signature: signProof(encoded, receiptPayload(binding)),
        issuerKey: publicKey,
      };
    },
  };
}
export function verifyInstanceReceipt(value: unknown, issuerKey: string): InstanceReceipt {
  const receipt = instanceReceiptSchema.parse(value);
  if (
    receipt.issuerKey !== issuerKey ||
    !verifyProof(issuerKey, receiptPayload(receipt.binding), receipt.signature)
  )
    throw new InstanceError("INSTANCE_INVALID_RECEIPT");
  return receipt;
}
export const instanceDigest = (value: string) => createHash("sha256").update(value).digest("hex");
