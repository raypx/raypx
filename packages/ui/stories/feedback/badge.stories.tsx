import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "../../src/components/badge.js";

const meta = {
  title: "Feedback/Badge",
  component: Badge,
  tags: ["autodocs"],
  args: { children: "Active", variant: "default" },
  argTypes: {
    children: { control: "text" },
    variant: { control: "select", options: ["default", "secondary", "destructive", "outline"] },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {};
export const Draft: Story = { args: { variant: "secondary", children: "Draft" } };
export const Failed: Story = { args: { variant: "destructive", children: "Failed" } };
export const Archived: Story = { args: { variant: "outline", children: "Archived" } };
