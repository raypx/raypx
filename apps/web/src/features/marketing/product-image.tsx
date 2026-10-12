import { useTheme } from "@voidmix/ui/theme";
import { useLocale, useTranslations } from "../../i18n/client";
import images from "./product-images.json";

type ProductView = "projects" | "detail" | "project-focus" | "task-focus";

/** Captures of actual routes, with synthetic accounts confined to the test DB. */
export function ProductImage({
  detail = false,
  priority = false,
  variant,
}: {
  detail?: boolean;
  priority?: boolean;
  variant?: ProductView;
}) {
  const locale = useLocale();
  const { theme, resolvedTheme } = useTheme();
  const t = useTranslations("marketing");
  const view = variant ?? (detail ? "detail" : "projects");
  const key = `${view}-${locale}-${resolvedTheme}` as keyof typeof images;
  const asset = images[key];
  const darkKey = `${view}-${locale}-dark` as keyof typeof images;
  return (
    <picture className="product-picture block">
      {theme === "system" ? (
        <>
          <source
            media="(prefers-color-scheme: dark) and (max-width: 767px)"
            srcSet={`/product/${darkKey}-mobile.webp`}
            width={images[darkKey].mobile.width}
            height={images[darkKey].mobile.height}
          />
          <source
            media="(prefers-color-scheme: dark)"
            srcSet={`/product/${darkKey}.webp`}
            width={images[darkKey].desktop.width}
            height={images[darkKey].desktop.height}
          />
        </>
      ) : null}
      <source
        media="(max-width: 767px)"
        srcSet={`/product/${key}-mobile.webp`}
        width={asset.mobile.width}
        height={asset.mobile.height}
      />
      <img
        className="block h-auto w-full"
        src={`/product/${key}.webp`}
        width={asset.desktop.width}
        height={asset.desktop.height}
        alt={t(view === "detail" || view === "task-focus" ? "detailImageAlt" : "projectsImageAlt")}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
      />
    </picture>
  );
}
