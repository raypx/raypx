import { routing } from "@raypx/i18n/locales";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}
