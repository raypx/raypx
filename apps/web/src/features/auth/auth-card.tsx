import { Link } from "@tanstack/react-router";
import { Logo } from "@voidmix/ui/logo";
import { useId, type ReactNode } from "react";
import { useTranslations } from "../../i18n/client";

interface AuthCardProps {
  children: ReactNode;
  description: string;
  footer?: ReactNode;
  title: string;
}

export function AuthCard({ children, description, footer, title }: AuthCardProps) {
  const t = useTranslations("auth");
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="auth-card flex w-full max-w-[360px] flex-col gap-7 [@media(pointer:coarse)]:[&_[data-slot=input-group]]:min-h-11"
    >
      <header className="flex flex-col gap-6">
        <Link
          aria-label={t("homeLabel")}
          className="w-fit rounded-lg text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [.auth-form-area_&]:hidden [@media(max-width:900px)]:[.auth-form-area_&]:inline-flex"
          to="/"
        >
          <Logo className="text-sm" />
        </Link>
        <div className="flex flex-col gap-2">
          <h1
            id={titleId}
            className="text-2xl leading-tight font-semibold tracking-tight text-balance"
          >
            {title}
          </h1>
          <p className="text-sm leading-5 text-pretty text-muted-foreground">{description}</p>
        </div>
      </header>
      {children}
      {footer ? (
        <footer className="text-center text-sm leading-6 text-muted-foreground">{footer}</footer>
      ) : null}
    </section>
  );
}
