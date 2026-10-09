import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConnectionStatus } from "../../src/components/connection-status.js";

const meta = {
  title: "Feedback/ConnectionStatus",
  component: ConnectionStatus,
  tags: ["autodocs"],
  args: { status: "connected" },
  argTypes: { status: { control: "select", options: ["loading", "connected", "error"] } },
  parameters: {
    docs: {
      description: {
        component:
          "Displays a caller-provided state. These stories do not request an API or test a live connection.",
      },
    },
  },
} satisfies Meta<typeof ConnectionStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};
export const Connecting: Story = { args: { status: "loading" } };
export const Offline: Story = { args: { status: "error" } };
