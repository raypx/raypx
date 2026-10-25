import { getBridge, isDesktop, localRequest } from "../../lib/desktop";

/** Explicit sign-out revokes host access; renderer teardown and cookie expiry do not. */
export async function signOutDesktopHost(accountId: string) {
  if (!isDesktop()) return;
  const bridge = await getBridge();
  await bridge.request.controlSession({ accountId: null });
  await bridge.request.controlDetach({});
  await localRequest("agents.local.detach", { accountId });
}
