import { getBridge, isDesktop } from "../../lib/desktop";

/** Explicit sign-out revokes host access; renderer teardown and cookie expiry do not. */
export async function signOutDesktopHost() {
  if (!isDesktop()) return;
  const bridge = await getBridge();
  await bridge.request.controlSession({ accountId: null });
  await bridge.request.controlDetach({});
}
