import type { Meta, StoryObj } from "@storybook/react-vite";
import { Avatar } from "@voidmix/ui/avatar";

const meta = {
  title: "Primitives/Avatar",
  component: Avatar,
  tags: ["autodocs"],
  args: {
    name: "Ada Lovelace",
    size: "medium",
  },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fallback: Story = {};

export const Small: Story = {
  args: {
    name: "Grace Hopper",
    size: "small",
  },
};

export const Large: Story = {
  args: {
    name: "Katherine Johnson",
    size: "large",
  },
};

export const WithLocalImage: Story = {
  args: {
    name: "Grace Hopper",
    imageUrl:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect width='96' height='96' fill='%23e5e5e5'/%3E%3Ccircle cx='48' cy='36' r='18' fill='%23171717'/%3E%3Cpath d='M20 88c4-20 16-30 28-30s24 10 28 30' fill='%23171717'/%3E%3C/svg%3E",
  },
};
