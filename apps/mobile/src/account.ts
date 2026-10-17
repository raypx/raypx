import { createNativeAuthClient, getNativeAuthHeaders } from "@raypx/auth/native";
import { createApiClient } from "@raypx/client";
import * as SecureStore from "expo-secure-store";

export const webUrl = process.env.EXPO_PUBLIC_WEB_URL || "http://localhost:3000";
const apiUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3002";
export const authClient = createNativeAuthClient({
  baseURL: apiUrl,
  scheme: "raypx",
  storage: SecureStore,
});
export const apiClient = createApiClient({
  baseUrl: apiUrl,
  headers: () => getNativeAuthHeaders(authClient),
});
