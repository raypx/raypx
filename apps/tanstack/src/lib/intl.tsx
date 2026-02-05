import { useRouteContext } from "@tanstack/react-router";
import { IntlProvider as BaseIntlProvider } from "use-intl";

export function IntlProvider({ children }: { children: React.ReactNode }) {
  const intl = useRouteContext({ from: "/$locale", select: (s) => s.intl });
  return (
    <BaseIntlProvider
      locale={intl.locale}
      messages={intl.messages}
      timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
    >
      {children}
    </BaseIntlProvider>
  );
}
