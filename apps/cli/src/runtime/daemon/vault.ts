import { createHash } from "node:crypto";
import { z } from "zod";
import { hostAuthorizationSchema, type HostAuthorization } from "@raypx/contracts/terminal";

export const hostBindingSchema = z.object({
  accountId: z.string().min(1).max(200),
  apiUrl: z.string().max(2048),
  deviceId: z.string().uuid(),
  epoch: z.number().int().positive(),
  expiresAt: z.iso.datetime(),
});
export type HostBinding = z.infer<typeof hostBindingSchema>;
export const bindingKey = (apiUrl: string, accountId: string) =>
  createHash("sha256")
    .update(JSON.stringify([apiUrl, accountId]))
    .digest("hex");
export interface HostVault {
  get(binding: HostBinding): Promise<HostAuthorization | undefined>;
  set(binding: HostBinding, value: HostAuthorization): Promise<boolean>;
  remove(binding: HostBinding): Promise<void>;
}
/** Secrets are never written to TOML, JSON, logs or the desktop bridge. */
export function createHostVault(): HostVault {
  const memory = new Map<string, HostAuthorization>();
  const name = (binding: HostBinding) =>
    `${bindingKey(binding.apiUrl, binding.accountId)}:${binding.deviceId}:${binding.epoch}`;
  const service = "pro.raypx.daemon";
  return {
    async get(binding) {
      const key = name(binding),
        cached = memory.get(key);
      if (cached) return structuredClone(cached);
      if (process.platform !== "darwin") return;
      try {
        const raw = await Bun.secrets.get({ service, name: key });
        if (!raw) return;
        const parsed = hostAuthorizationSchema.parse(JSON.parse(raw));
        if (
          parsed.accountId !== binding.accountId ||
          parsed.deviceId !== binding.deviceId ||
          parsed.epoch !== binding.epoch
        )
          return;
        memory.set(key, parsed);
        return structuredClone(parsed);
      } catch {
        return;
      }
    },
    async set(binding, value) {
      const key = name(binding);
      memory.set(key, structuredClone(value));
      if (process.platform !== "darwin") return false;
      try {
        await Bun.secrets.set({ service, name: key, value: JSON.stringify(value) });
        return true;
      } catch {
        return false;
      }
    },
    async remove(binding) {
      const key = name(binding);
      memory.delete(key);
      if (process.platform === "darwin") {
        try {
          await Bun.secrets.delete({ service, name: key });
        } catch {
          /* A stale key grants no access after server revocation. */
        }
      }
    },
  };
}
