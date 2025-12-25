import type { ComponentType, SVGProps } from "react";
import { lazy, Suspense, useMemo } from "react";
import type { NonEmptyObject, SetOptional, Simplify } from "type-fest";
import { logger } from "../lib/logger";

export type TablerIconProps = SVGProps<SVGSVGElement>;

export type IconProps = Simplify<
  SetOptional<TablerIconProps, "ref"> & {
    name: string;
    fallback?: React.ReactNode;
  }
>;

type TablerIcon = ComponentType<TablerIconProps>;
type IconModule = NonEmptyObject<{ default: TablerIcon }>;

function Icon({ name, fallback = null, ...props }: IconProps) {
  const TablerIcon = useMemo(
    () =>
      lazy(async (): Promise<IconModule> => {
        try {
          // Ensure name has Icon prefix
          const iconName = name.startsWith("Icon") ? name : `Icon${name}`;
          const tablerModule = await import("@tabler/icons-react");
          const IconComponent = tablerModule[iconName as keyof typeof tablerModule];
          return { default: (IconComponent as TablerIcon) || (() => null) };
        } catch (error) {
          logger.error("Error importing icon", { error });
          return { default: () => null };
        }
      }),
    [name],
  );

  return (
    <Suspense fallback={fallback}>
      <TablerIcon {...props} />
    </Suspense>
  );
}

Icon.displayName = "Icon";

export { Icon };
