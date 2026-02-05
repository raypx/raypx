import { redirect } from "@raypx/i18n";

export default function RootPage() {
  redirect({ href: { pathname: "/" }, locale: "en" });
  return null;
}
