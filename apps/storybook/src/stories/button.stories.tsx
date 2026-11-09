import { Button } from "@raypx/ui/components/ui/button";
import { IconButton } from "@raypx/ui/icon-button";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowRightIcon } from "@raypx/icons/arrow-right";
import { PlusIcon } from "@raypx/icons/plus";
import { SettingsIcon } from "@raypx/icons/settings";
import { DeleteIcon } from "@raypx/icons/delete";

const meta = {
  title: "Primitives/Button",
  component: Button,
  args: { children: "Continue", variant: "default", size: "default", disabled: false },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline", "secondary", "ghost", "destructive", "link"],
    },
    size: { control: "select", options: ["xs", "sm", "default", "lg", "xl"] },
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
      <Button {...args} size="xl">
        Form action
      </Button>
    </div>
  ),
};

export const WithIcons: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args}>
        <PlusIcon aria-hidden="true" data-icon="inline-start" />
        New task
      </Button>
      <Button {...args} variant="outline">
        Next
        <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
      </Button>
    </div>
  ),
};

export const IconButtons: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <IconButton label="Settings">
        <SettingsIcon aria-hidden="true" />
      </IconButton>
      <IconButton label="Delete" hint="Delete this device permanently" variant="destructive">
        <DeleteIcon aria-hidden="true" />
      </IconButton>
      <IconButton label="Add" variant="outline" size="icon-sm">
        <PlusIcon aria-hidden="true" />
      </IconButton>
      <IconButton label="Unavailable" disabled>
        <SettingsIcon aria-hidden="true" />
      </IconButton>
    </div>
  ),
};
