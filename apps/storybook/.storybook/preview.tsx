import { TooltipProvider } from "@voidmix/ui/components/ui/tooltip";
import "../src/preview.css";

import { ThemeProvider } from "@voidmix/ui/theme";
import type { Decorator, Preview } from "@storybook/react-vite";

const withThemeProvider: Decorator = (Story, context) => {
  const theme = context.globals.theme === "dark" ? "dark" : "light";
  return (
    <ThemeProvider
      key={theme}
      disableScript
      disableTransitionOnChange
      initialTheme={theme}
      storageKey={false}
    >
      <TooltipProvider delay={300}>
        <Story />
      </TooltipProvider>
    </ThemeProvider>
  );
};

const preview: Preview = {
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: { test: "todo" },
  },
  globalTypes: {
    theme: {
      description: "Theme",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "light", icon: "sun", title: "Light" },
          { value: "dark", icon: "moon", title: "Dark" },
        ],
      },
    },
  },
  initialGlobals: { theme: "light" },
  decorators: [withThemeProvider],
};

export default preview;
