import { Button } from "@raypx/ui/components/ui/button";
import { IconButton } from "@raypx/ui/icon-button";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowRight, Plus, Settings, Trash2 } from "lucide-react";

const meta = {
  title: "Primitives/Button",
  component: Button,
  args: { children: "Continue", variant: "default", size: "default", disabled: false },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline", "secondary", "ghost", "destructive", "link"],
    },
    size: { control: "select", options: ["xs", "sm", "default", "lg"] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args} variant="default">
        Default
      </Button>
      <Button {...args} variant="outline">
        Outline
      </Button>
      <Button {...args} variant="secondary">
        Secondary
      </Button>
      <Button {...args} variant="ghost">
        Ghost
      </Button>
      <Button {...args} variant="destructive">
        Destructive
      </Button>
      <Button {...args} variant="link">
        Link
      </Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args} size="xs">
        Extra small
      </Button>
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args} size="default">
        Default
      </Button>
      <Button {...args} size="lg">
        Large
      </Button>
    </div>
  ),
};

export const WithIcons: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args}>
        <Plus aria-hidden="true" data-icon="inline-start" />
        New task
      </Button>
      <Button {...args} variant="outline">
        Next
        <ArrowRight aria-hidden="true" data-icon="inline-end" />
      </Button>
    </div>
  ),
};

export const IconButtons: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <IconButton label="Settings">
        <Settings aria-hidden="true" />
      </IconButton>
      <IconButton label="Delete" hint="Delete this device permanently" variant="destructive">
        <Trash2 aria-hidden="true" />
      </IconButton>
      <IconButton label="Add" variant="outline" size="icon-sm">
        <Plus aria-hidden="true" />
      </IconButton>
      <IconButton label="Unavailable" disabled>
        <Settings aria-hidden="true" />
      </IconButton>
    </div>
  ),
};
