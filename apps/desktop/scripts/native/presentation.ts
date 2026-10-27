/** Keep automated acceptance inactive unless foreground GUI checks are selected. */
export function nativePresentation(environment: Readonly<Record<string, string | undefined>>) {
  const interactive =
    environment.RAYPX_NATIVE_SMOKE !== "1" || environment.RAYPX_NATIVE_SMOKE_UI === "interactive";
  return { activate: interactive, notifications: interactive, dialogs: interactive };
}
