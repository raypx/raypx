import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import type { ExpoClientStorage } from "@better-auth/expo/client";
// The application injects SecureStore so non-native consumers never install Expo.
export function createNativeAuthClient(options: {
  baseURL: string;
  scheme: string;
  storage: ExpoClientStorage;
  storagePrefix?: string;
}) {
  return createAuthClient({
    baseURL: options.baseURL,
    plugins: [
      expoClient({
        scheme: options.scheme,
        storagePrefix: options.storagePrefix ?? "raypx",
        storage: options.storage,
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
