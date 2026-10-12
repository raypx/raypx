import { createApiClient, type ApiClient } from "@voidmix/client";
import { env } from "../env";
import { getDesktopLocaleHeaders } from "../i18n/client";

export type AccountProfile = Awaited<ReturnType<ApiClient["account"]["get"]>>;
export type AccountState =
  | { status: "loading" | "unconfigured" | "signed_out" | "unavailable" }
  | { status: "signed_in"; profile: AccountProfile };

export async function loadAccount(apiUrl = env.VITE_API_URL): Promise<AccountState> {
  if (!apiUrl) return { status: "unconfigured" };
  try {
    const client = createApiClient({
      baseUrl: apiUrl,
      headers: getDesktopLocaleHeaders,
      fetch: (input, init) => globalThis.fetch(input, { ...init, credentials: "include" }),
    });
    return { status: "signed_in", profile: await client.account.get({}) };
  } catch (error) {
    return {
      status:
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "UNAUTHORIZED"
          ? "signed_out"
          : "unavailable",
    };
  }
}
