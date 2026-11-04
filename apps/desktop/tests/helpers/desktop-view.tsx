import type { ReactNode } from "react";
import { DesktopPlatformProvider } from "../../src/lib/platform-context";
import { DesktopRuntimeProvider } from "../../src/features/engine/provider";
import type { desktopFixture } from "./desktop";

export function DesktopFixtureProvider({
  fixture,
  children,
}: {
  fixture: ReturnType<typeof desktopFixture>;
  children: ReactNode;
}) {
  return (
    <DesktopPlatformProvider platform={fixture.platform}>
      <DesktopRuntimeProvider>{children}</DesktopRuntimeProvider>
    </DesktopPlatformProvider>
  );
}
