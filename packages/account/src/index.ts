import type { ApiClient } from "@raypx/client";
import type { AccountProfile } from "@raypx/contracts/api";

export type { AccountProfile } from "@raypx/contracts/api";
export type AccountState =
  | { status: "signed-in"; account: AccountProfile }
  | { status: "signed-out" }
  | { status: "unavailable" };

/** Reads the safe account projection without owning credentials or session storage. */
export async function readAccount(
  client: Pick<ApiClient, "account">,
  { signal }: { signal?: AbortSignal } = {},
): Promise<AccountState> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error("ACCOUNT_TIMEOUT")), 5000);
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const account = await client.account.get({}, { signal: controller.signal });
    if (controller.signal.aborted) throw controller.signal.reason;
    return { status: "signed-in", account };
  } catch (error) {
    if (signal?.aborted) throw error;
    return error && typeof error === "object" && "code" in error && error.code === "UNAUTHORIZED"
      ? { status: "signed-out" }
      : { status: "unavailable" };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
