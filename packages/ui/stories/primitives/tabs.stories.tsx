import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../src/components/tabs.js";

const meta = {
  title: "Primitives/Tabs",
  component: Tabs,
  args: { defaultValue: "overview", orientation: "horizontal", activationMode: "automatic" },
  argTypes: {
    orientation: { control: "radio", options: ["horizontal", "vertical"] },
    activationMode: { control: "radio", options: ["automatic", "manual"] },
    value: { control: false },
    children: { control: false },
  },
  render: (args) => (
    <Tabs
      {...args}
      className={args.orientation === "vertical" ? "flex max-w-2xl gap-4" : "w-full max-w-2xl"}
    >
      <TabsList aria-label="Project details">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="billing" disabled>
          Billing
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="flex-1">
        <h2 className="text-lg font-semibold">Project overview</h2>
        <p className="text-sm text-muted-foreground">
          Review the workspace members and project permissions.
        </p>
      </TabsContent>
      <TabsContent value="activity" className="flex-1">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <p className="text-sm text-muted-foreground">No changes have been made today.</p>
      </TabsContent>
    </Tabs>
  ),
} satisfies Meta<typeof Tabs>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Automatic: Story = {};
export const Vertical: Story = { args: { orientation: "vertical" } };
export const Manual: Story = {
  args: { activationMode: "manual" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const overview = canvas.getByRole("tab", { name: "Overview" });
    overview.focus();
    await userEvent.keyboard("{ArrowRight}");
    const activity = canvas.getByRole("tab", { name: "Activity" });
    await waitFor(() => expect(activity).toHaveFocus());
    await expect(overview).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Enter}");
    await expect(activity).toHaveAttribute("aria-selected", "true");
    await expect(canvas.getByRole("tabpanel", { name: "Activity" })).toHaveTextContent(
      "Recent activity",
    );
  },
};
export const KeyboardNavigation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const overview = canvas.getByRole("tab", { name: "Overview" });
    overview.focus();
    await userEvent.keyboard("{ArrowRight}");
    const activity = canvas.getByRole("tab", { name: "Activity" });
    await waitFor(() => expect(activity).toHaveFocus());
    await expect(activity).toHaveAttribute("aria-selected", "true");
    await expect(canvas.getByRole("tabpanel", { name: "Activity" })).toHaveTextContent(
      "Recent activity",
    );
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(overview).toHaveFocus());
    await expect(canvas.getByRole("tab", { name: "Billing" })).toBeDisabled();
  },
};
