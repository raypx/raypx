import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import type { ComponentProps } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../../src/components/avatar.js";

const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#262626"/><text x="40" y="48" text-anchor="middle" font-family="sans-serif" font-size="28" fill="white">AL</text></svg>')}`;
type AvatarArgs = ComponentProps<typeof Avatar> & { src: string; name: string; initials: string };
const meta = {
  title: "Primitives/Avatar",
  component: Avatar,
  args: { src: image, name: "Alex Lee", initials: "AL", className: "h-10 w-10" },
  argTypes: {
    src: { control: "text" },
    name: { control: "text" },
    initials: { control: "text" },
    className: { control: "text" },
    children: { control: false },
  },
  render: ({ src, name, initials, ...args }) => (
    <Avatar {...args} asChild>
      <figure aria-label={name}>
        <AvatarImage src={src} alt="" />
        <AvatarFallback aria-hidden="true">{initials}</AvatarFallback>
      </figure>
    </Avatar>
  ),
} satisfies Meta<AvatarArgs>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Image: Story = {};
export const Initials: Story = { args: { src: "" } };
export const Large: Story = { args: { className: "h-16 w-16 text-lg" } };
export const UnavailableImage: Story = {
  args: { src: "data:image/png;base64,invalid-image" },
  play: async ({ canvasElement }) => {
    const avatar = within(canvasElement).getByRole("figure", { name: "Alex Lee" });
    await expect(await within(avatar).findByText("AL")).toBeVisible();
  },
};
