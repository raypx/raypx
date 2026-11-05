import type { ReactNode } from "react";
import { DesktopPlatformProvider } from "../../src/lib/platform-context.tsx";
import { DesktopRuntimeProvider } from "../../src/features/engine/provider.tsx";
import type { desktopFixture } from "./desktop.ts";

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
