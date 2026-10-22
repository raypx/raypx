import { TooltipProvider } from "@raypx/ui/components/ui/tooltip";
import { ThemeProvider, parseTheme } from "@raypx/ui/themes";
import type { Decorator, Preview } from "@storybook/react-vite";
import "../src/styles.css";

// The toolbar owns the preference; nothing is persisted from the preview.
const withTheme: Decorator = (Story, context) => {
  const theme = parseTheme(context.globals["theme"], "light");
  return (
    <ThemeProvider storageKey={false} initialTheme={theme} key={theme}>
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    </ThemeProvider>
  );
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: "Neutral theme",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" },
          { value: "system", title: "System", icon: "browser" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "light" },
  parameters: {
    layout: "centered",
    controls: { expanded: true },
  },
  tags: ["autodocs"],
};

export default preview;
