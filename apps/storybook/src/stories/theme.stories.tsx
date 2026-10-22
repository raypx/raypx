import { ThemePicker, type UserTheme } from "@raypx/ui/themes";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

const labels: Record<UserTheme, string> = { light: "Light", dark: "Dark", system: "System" };

function ThemePickerExample() {
  const [value, setValue] = useState<UserTheme>("system");
  return <ThemePicker value={value} onValueChange={setValue} label="Theme" labels={labels} />;
}

const meta = {
  title: "Patterns/Theme picker",
  component: ThemePicker,
} satisfies Meta<typeof ThemePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

// The picker is controlled; the preview toolbar's Theme switch drives the actual palette.
export const Controlled: Story = {
  args: { value: "system", label: "Theme", labels, onValueChange: () => undefined },
  render: () => <ThemePickerExample />,
};
