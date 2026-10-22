import { Alert, AlertDescription, AlertTitle } from "@raypx/ui/components/ui/alert";
import { Button } from "@raypx/ui/components/ui/button";
import { Skeleton } from "@raypx/ui/components/ui/skeleton";
import { EmptyState } from "@raypx/ui/empty-state";
import { LoadingState } from "@raypx/ui/loading-state";
import { AsyncToaster, toast } from "@raypx/ui/toast";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CircleAlert, Inbox, Info } from "lucide-react";

const meta = {
  title: "Patterns/Feedback",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Alerts: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-3">
      <Alert>
        <Info aria-hidden="true" />
        <AlertTitle>Desktop connected</AlertTitle>
        <AlertDescription>Remote tasks now run on this device.</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Unable to reach the API</AlertTitle>
        <AlertDescription>Check your connection and try again.</AlertDescription>
      </Alert>
    </div>
  ),
};

export const Empty: Story = {
  render: () => (
    <EmptyState
      icon={<Inbox aria-hidden="true" />}
      title="No tasks yet"
      description="Tasks you start from the desktop app appear here."
      action={<Button>Open desktop app</Button>}
    />
  ),
};

export const Loading: Story = {
  render: () => (
    <div className="max-w-md">
      <LoadingState label="Loading account…" />
    </div>
  ),
};

export const Skeletons: Story = {
  render: () => (
    <div className="flex max-w-sm items-center gap-3">
      <Skeleton className="size-10 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  ),
};

export const Toasts: Story = {
  render: () => (
    <AsyncToaster>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => toast.add({ title: "Saved", description: "Preferences updated." })}
        >
          Default
        </Button>
        <Button
          variant="outline"
          onClick={() => toast.add({ type: "success", title: "Task completed" })}
        >
          Success
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.add({ type: "error", title: "Sign-in failed", description: "Try again." })
          }
        >
          Error
        </Button>
      </div>
    </AsyncToaster>
  ),
};
