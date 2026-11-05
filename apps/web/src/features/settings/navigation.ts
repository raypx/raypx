import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";

const settingsSections = [
  "account",
  "preferences",
  "diagnostics",
  "password",
  "sessions",
  "instances",
] as const;
export type SettingsSection = (typeof settingsSections)[number];

export function settingsSection(hash: string): SettingsSection | null {
  return settingsSections.find((section) => hash === `settings/${section}`) ?? null;
}

/** Hash-only navigation keeps the background route, its search and its mounted drafts. */
export function useSettingsNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const section = settingsSection(location.hash);
  return {
    section,
    open: (next: SettingsSection = "account") =>
      navigate({
        hash: `settings/${next}`,
        search: true,
        replace: section !== null,
        state: (previous) =>
          section
            ? previous
            : {
                ...previous,
                settingsBackground: { href: location.href, index: location.state.__TSR_index },
              },
        resetScroll: false,
        hashScrollIntoView: false,
      }),
    close: () => {
      const background = location.state.settingsBackground;
      if (
        background &&
        background.index === location.state.__TSR_index - 1 &&
        background.href.split("#")[0] === location.href.split("#")[0]
      ) {
        router.history.back();
        return;
      }
      void navigate({
        hash: "",
        search: true,
        replace: true,
        state: ({ settingsBackground: _background, ...previous }) => previous,
        resetScroll: false,
        hashScrollIntoView: false,
      });
    },
  };
}
