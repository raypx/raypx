import type { Meta, StoryObj } from "@storybook/react-vite";
import { Logo } from "@raypx/ui/logo";

const meta = {
  title: "Primitives/Logo",
  component: Logo,
  tags: ["autodocs"],
  args: {
    label: "Raypx",
  },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomLabel: Story = {
  args: {
    label: "Raypx Projects",
  },
};

export const ThemeAware: Story = {
  args: {
    label: "Theme-aware logo",
  },
};
