import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../src/components/accordion.js";

const meta = {
  title: "Primitives/Accordion",
  component: Accordion,
  args: { type: "single" },
  argTypes: {
    type: { control: false },
    value: { control: false },
    defaultValue: { control: false },
    collapsible: { control: "boolean" },
    children: { control: false },
  },
  render: (args) => (
    <Accordion {...args} className="w-full max-w-xl">
      <AccordionItem value="access">
        <AccordionTrigger>Who can access this workspace?</AccordionTrigger>
        <AccordionContent>
          Only invited members can view projects in this workspace.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="transfer">
        <AccordionTrigger>Can I transfer a project?</AccordionTrigger>
        <AccordionContent>
          Workspace owners can move projects to another workspace they manage.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="billing" disabled>
        <AccordionTrigger>How do I update billing?</AccordionTrigger>
        <AccordionContent>Billing settings are unavailable for this example.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
} satisfies Meta<typeof Accordion>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Collapsible: Story = { args: { collapsible: true } };
export const OpenInitially: Story = { args: { defaultValue: "access", collapsible: true } };
export const Multiple: Story = {
  args: { type: "multiple", defaultValue: ["access", "transfer"] },
};
export const KeyboardNavigation: Story = {
  args: { collapsible: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const access = canvas.getByRole("button", { name: "Who can access this workspace?" });
    access.focus();
    await userEvent.keyboard("{Enter}");
    await expect(access).toHaveAttribute("aria-expanded", "true");
    await expect(
      await canvas.findByText("Only invited members can view projects in this workspace."),
    ).toBeVisible();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Can I transfer a project?" })).toHaveFocus(),
    );
    await userEvent.keyboard("{End}");
    await expect(canvas.getByRole("button", { name: "Can I transfer a project?" })).toHaveFocus();
    await userEvent.keyboard("{Home}{Enter}");
    await expect(access).toHaveAttribute("aria-expanded", "false");
  },
};
