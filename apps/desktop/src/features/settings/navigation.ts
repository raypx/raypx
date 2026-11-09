import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";

/** The settings fragment keeps the background page, search and mounted editors intact. */
export function useSettingsNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const opened = location.hash === "settings";
  return {
    opened,
    open: () =>
      navigate({
        hash: "settings",
        search: true,
        replace: opened,
        state: (previous) =>
          opened
            ? previous
            : {
                ...previous,
                desktopSettingsBackground: {
                  href: location.href,
                  index: location.state.__TSR_index,
                },
              },
        resetScroll: false,
        hashScrollIntoView: false,
      }),
    close: () => {
      const background = location.state.desktopSettingsBackground;
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
        state: ({ desktopSettingsBackground: _background, ...previous }) => previous,
        resetScroll: false,
        hashScrollIntoView: false,
      });
    },
  };
}
