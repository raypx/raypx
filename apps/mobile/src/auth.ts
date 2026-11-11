import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { serverOrigin, sessionStoragePrefix } from "./config.js";

export const apiOrigin = serverOrigin(process.env.EXPO_PUBLIC_API_URL ?? "https://raypx.com");

export const authClient = createAuthClient({
  baseURL: apiOrigin,
  // Native Fetch can send Origin. Reuse the API's existing exact HTTPS origin policy;
  // email/password and session requests do not need an OAuth deep-link server plugin.
  fetchOptions: { headers: { Origin: apiOrigin } },
  sessionOptions: { refetchInterval: 60 },
  plugins: [
    expoClient({
      scheme: "raypx-mobile",
      storagePrefix: sessionStoragePrefix(apiOrigin),
      disableCache: true,
      storage: {
        getItem: (key) => SecureStore.getItem(key),
        getItemAsync: (key) => SecureStore.getItemAsync(key),
        setItem: (key, value) =>
          SecureStore.setItem(key, value, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          }),
        setItemAsync: (key, value) =>
          SecureStore.setItemAsync(key, value, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          }),
      },
    }),
  ],
});
