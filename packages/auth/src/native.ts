import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
export function createNativeAuthClient(options: {
  baseURL: string;
  scheme: string;
  storagePrefix?: string;
}) {
  return createAuthClient({
    baseURL: options.baseURL,
    plugins: [
      expoClient({
        scheme: options.scheme,
        storagePrefix: options.storagePrefix ?? "raypx",
        storage: SecureStore,
      }),
    ],
  });
}
export async function getNativeAuthHeaders(client: {
  getCookie(): string | Promise<string>;
}): Promise<Record<string, string>> {
  const cookie = await client.getCookie();
  return cookie ? { cookie } : {};
}
