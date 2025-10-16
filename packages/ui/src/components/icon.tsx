import type { LucideProps } from "lucide-react";
import { type ComponentType, lazy, Suspense, useMemo } from "react";
import type { NonEmptyObject, SetOptional, Simplify } from "type-fest";

export type IconProps = Simplify<
  SetOptional<LucideProps, "ref"> & {
    name: string;
    fallback?: React.ReactNode;
  }
>;

type LucideIcon = ComponentType<LucideProps>;
type IconModule = NonEmptyObject<{ default: LucideIcon }>;

export function Icon({ name, fallback = null, ...props }: IconProps) {
  const LucideIcon = useMemo(
    () =>
      lazy(async (): Promise<IconModule> => {
        try {
          const lucideModule = await import("lucide-react");
          const IconComponent = lucideModule[name as keyof typeof lucideModule];
          return { default: (IconComponent as LucideIcon) || (() => null) };
        } catch {
          return { default: () => null };
        }
      }),
    [name],
  );

  return (
    <Suspense fallback={fallback}>
      <LucideIcon {...props} />
    </Suspense>
  );
}
