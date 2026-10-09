import type { Preview } from "@storybook/react-vite";
import { withThemeByClassName } from "@storybook/addon-themes";
import { ThemedDocsContainer } from "./docs-container.js";
import "./styles.css";

const preview = {
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: { container: ThemedDocsContainer },
    controls: { expanded: true, matchers: { color: /(background|color)$/i, date: /Date$/ } },
    a11y: { test: "error" },
    options: { storySort: { order: ["Primitives", "Forms", "Feedback", "Overlays"] } },
  },
  decorators: [
    withThemeByClassName({
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
      parentSelector: "html",
    }),
    (Story, context) =>
      context.viewMode === "docs" ? (
        <div className="text-foreground">
          <Story />
        </div>
      ) : (
        <main className="text-foreground">
          <Story />
        </main>
      ),
  ],
} satisfies Preview;

export default preview;
