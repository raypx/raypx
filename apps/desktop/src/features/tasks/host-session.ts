import * as desktop from "../../lib/desktop";
import type { DesktopPlatform } from "../../lib/platform";

/** Explicit sign-out revokes host access; renderer teardown and cookie expiry do not. */
export async function signOutDesktopHost(
  platform: Pick<DesktopPlatform, "getBridge" | "isDesktop"> = desktop,
) {
  if (!platform.isDesktop()) return;
  const bridge = await platform.getBridge();
  await bridge.request.controlSession({ accountId: null });
  await bridge.request.controlDetach({});
}
