import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Composer } from "@voidmix/agent-ui/composer";
import { ConversationFeed } from "@voidmix/agent-ui/conversation";
import { SourceList } from "@voidmix/agent-ui/research";
import { CloudRunControls, CloudRunTimeline, type CloudRunLabels } from "@voidmix/agent-ui/runs";
import { TaskProgress, RevisionReview } from "@voidmix/agent-ui/tasks";
const labels: CloudRunLabels = {
  status: {
    queued: "Queued",
    running: "Running",
    needs_input: "Needs input",
    succeeded: "Succeeded",
    failed: "Failed",
    cancelled: "Cancelled",
  },
  cancel: "Cancel run",
  pending: "Waiting for confirmation",
  retry: "Retry",
  loading: "Loading",
  failed: "Failed",
  input: "Input",
  output: "Output",
  execution: "Execution",
};
const meta = {
  title: "Agent/Cloud workbench",
  component: ConversationFeed,
  parameters: { layout: "padded" },
  args: {
    messages: [
      { id: "u", role: "user", text: "Research quarterly results and prepare a report." },
      {
        id: "a",
        role: "assistant",
        text: "## Findings\nReview each cited source before accepting the report.\n\n| Quarter | Revenue |\n| --- | --- |\n| Q1 | 120 |\n| Q2 | 140 |",
      },
    ],
    labels: {
      title: "Conversation",
      user: "You",
      assistant: "Voidmix",
      latest: "Jump to latest",
      empty: "Start with a question",
    },
  },
} satisfies Meta<typeof ConversationFeed>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Research: Story = {
  render: (args) => (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <ConversationFeed {...args} />
      <SourceList
        sources={[
          {
            id: "s",
            title: "Example quarterly report",
            url: "https://example.com/report",
            excerpt: "Deterministic example source for component acceptance.",
          },
        ]}
        labels={{ title: "Sources", empty: "No sources" }}
      />
    </div>
  ),
};
export const Running: Story = {
  render: () => (
    <div className="flex max-w-2xl flex-col gap-5">
      <CloudRunControls status="running" cancelPending onCancel={() => {}} labels={labels} />
      <CloudRunTimeline
        items={[
          {
            id: "t",
            kind: "tool",
            tool: {
              id: "t",
              name: "compute_table",
              status: "running",
              summary: "quarterly.csv",
              input: { operation: "sum" },
            },
          },
          { id: "child", kind: "execution", role: "researcher", status: "running" },
        ]}
        labels={labels}
      />
    </div>
  ),
};
export const Review: Story = {
  render: () => (
    <div className="flex max-w-2xl flex-col gap-6">
      <TaskProgress
        title="Quarterly analysis"
        goal="Prepare an eight-slide presentation."
        status="review"
        labels={{
          open: "Open",
          in_progress: "In progress",
          waiting_input: "Waiting for input",
          review: "Ready for review",
          completed: "Completed",
          cancelled: "Cancelled",
        }}
      />
      <RevisionReview
        revision={2}
        summary="Report, workbook and presentation are ready."
        accepted={false}
        onAccept={() => {}}
        labels={{
          revision: "Revision",
          accept: "Accept delivery",
          accepted: "Accepted",
          pending: "Saving",
        }}
      />
    </div>
  ),
};
function ComposerExample() {
  const [value, setValue] = useState("");
  return (
    <Composer
      value={value}
      onValueChange={setValue}
      onSubmit={async () => {
        throw new Error("Story error state");
      }}
      labels={{
        label: "Your input",
        placeholder: "支持中文输入法…",
        submit: "Send",
        submitting: "Sending",
        failed: "The request failed. Your draft is kept.",
        hint: "Enter to send · Shift + Enter for a new line",
      }}
    />
  );
}
export const Input: Story = { render: () => <ComposerExample /> };
export const Dark: Story = { ...Research, globals: { theme: "dark" } };
