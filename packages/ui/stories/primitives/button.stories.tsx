import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Button } from "../../src/components/button.js";

const meta = {
  title: "Primitives/Button",
  component: Button,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    children: "Continue",
    variant: "default",
    size: "default",
    disabled: false,
    asChild: false,
    onClick: fn<() => void>(),
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "destructive", "outline", "secondary", "ghost", "link"],
    },
    size: { control: "select", options: ["default", "sm", "lg", "icon"] },
    children: { control: "text" },
    disabled: { control: "boolean" },
    asChild: { control: "boolean" },
    onClick: { control: false },
  },
  render: (args) =>
    args.asChild ? (
      <Button {...args} onClick={args.disabled ? undefined : args.onClick}>
        <a
          href="#details"
          aria-disabled={args.disabled || undefined}
          tabIndex={args.disabled ? -1 : undefined}
          onClick={(event) => {
            if (args.disabled) event.preventDefault();
          }}
        >
          {args.children}
        </a>
      </Button>
    ) : (
      <Button {...args} />
    ),
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Destructive: Story = { args: { variant: "destructive", children: "Delete project" } };
export const Outline: Story = { args: { variant: "outline" } };
export const Secondary: Story = { args: { variant: "secondary" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Link: Story = { args: { variant: "link" } };
export const Small: Story = { args: { size: "sm" } };
export const Large: Story = { args: { size: "lg" } };
export const Icon: Story = { args: { size: "icon", children: "+", "aria-label": "Add item" } };
export const Disabled: Story = { args: { disabled: true } };
export const AsChild: Story = {
  args: { asChild: true, children: "View details" },
  parameters: {
    docs: {
      description: {
        story:
          "The child anchor keeps its link semantics. Disabled links also need aria-disabled, a removed tab stop, and prevented navigation, as shown by the renderer.",
      },
    },
  },
};
