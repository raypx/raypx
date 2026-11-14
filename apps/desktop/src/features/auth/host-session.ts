import * as desktop from "../../lib/desktop.js";
import type { DesktopPlatform } from "../../lib/platform.js";

/** Explicit sign-out clears the Desktop session selection and event streams. */
export async function signOutDesktopHost(
  platform: Pick<DesktopPlatform, "getBridge" | "isDesktop"> = desktop,
) {
  if (!platform.isDesktop()) return;
  const bridge = await platform.getBridge();
  await bridge.request.controlSession({ accountId: null });
}
