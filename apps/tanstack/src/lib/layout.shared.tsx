import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { i18n } from "./i18n";

export function baseOptions(locale: string): BaseLayoutProps {
  return {
    nav: {
      title: "Tanstack Start",
    },
    i18n,
  };
}
