import { lazy, Suspense } from "react";
import { useSettingsNavigation } from "./navigation.js";

const AccountSettingsDialog = lazy(() => import("./account-dialog.js"));

/** Shared by public, workspace and administrator account menus; loaded only when open. */
export function AccountSettingsOverlay() {
  const { section, open, close } = useSettingsNavigation();
  return section ? (
    <Suspense fallback={null}>
      <AccountSettingsDialog section={section} onSectionChange={open} onClose={close} />
    </Suspense>
  ) : null;
}
