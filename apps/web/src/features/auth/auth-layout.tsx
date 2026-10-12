import { Link, Outlet } from "@tanstack/react-router";
import { Logo } from "@voidmix/ui/logo";
import { ThemeSwitcher } from "../../components/theme-switcher";
import { LanguageSwitcher } from "../../components/language-switcher";
import { ProductImage } from "../marketing/product-image";
import { useTranslations } from "../../i18n/client";

export function AuthLayout() {
  const t = useTranslations("marketing");
  return (
    <main className="grid min-h-svh grid-cols-2 [@media(max-width:900px)]:grid-cols-1">
      <section
        className="flex flex-col gap-12 overflow-hidden border-r border-border bg-sidebar px-12 py-10 [@media(max-width:900px)]:hidden"
        aria-label={t("projectWorkbench")}
      >
        <Link to="/" aria-label={t("homeLabel")}>
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-center gap-8 py-6">
          <div>
            <h2 className="mb-3 max-w-[12em] text-[28px] leading-[1.3] font-semibold tracking-[-0.025em]">
              {t("workHeroTitle")}
            </h2>
            <p className="max-w-[44ch] text-sm leading-[1.6] text-muted-foreground">
              {t("workHeroDescription")}
            </p>
          </div>
          <figure className="m-0 [&_img]:h-auto [&_img]:w-full [&_img]:rounded-xl [&_img]:border [&_img]:border-border">
            <ProductImage />
            <figcaption className="mt-3 text-xs leading-[1.6] text-muted-foreground">
              {t("sampleProject")}
            </figcaption>
          </figure>
        </div>
      </section>
      <section className="auth-form-area relative flex items-center justify-center bg-background px-10 py-24 [@media(max-width:480px)]:px-6 [@media(max-width:480px)]:pb-12">
        <div className="absolute top-6 right-6 flex gap-2 [@media(max-width:480px)]:top-5 [@media(max-width:480px)]:right-5">
          <LanguageSwitcher />
          <ThemeSwitcher />
        </div>
        <Outlet />
      </section>
    </main>
  );
}
