import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { Badge } from "../../src/components/badge.js";
import { EmptyState } from "../../src/components/empty-state.js";
import { ErrorState } from "../../src/components/error-state.js";
import { Button } from "../../src/components/button.js";
import { Skeleton } from "../../src/components/skeleton.js";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../src/components/table.js";

const projects = [
  { name: "Documentation", owner: "Alex Lee", state: "Active" },
  { name: "Customer portal", owner: "Morgan Chen", state: "Draft" },
  { name: "Usage reports", owner: "Sam Rivera", state: "Active" },
];
type TableArgs = ComponentProps<typeof Table> & {
  state: "ready" | "empty" | "loading" | "error";
  longValues: boolean;
};
const meta = {
  title: "Primitives/Table",
  component: Table,
  args: { state: "ready", longValues: false, containerLabel: "Workspace projects" },
  argTypes: {
    state: { control: "radio", options: ["ready", "empty", "loading", "error"] },
    longValues: { control: "boolean" },
    containerLabel: { control: "text" },
    children: { control: false },
  },
  render: ({ state, longValues, ...args }) => (
    <div className="w-full max-w-2xl">
      {state === "loading" && <output className="sr-only">Loading workspace projects.</output>}
      <Table {...args} aria-busy={state === "loading"}>
        <TableCaption>Projects in the personal workspace.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Project</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {state === "empty" ? (
            <TableRow>
              <TableCell colSpan={3}>
                <EmptyState
                  title="No projects yet"
                  description="Create a project to organize work in this workspace."
                  action={<Button>Create project</Button>}
                />
              </TableCell>
            </TableRow>
          ) : state === "error" ? (
            <TableRow>
              <TableCell colSpan={3}>
                <ErrorState
                  title="Projects could not be loaded"
                  description="Check your connection and try loading the list again."
                  action={<Button variant="outline">Reload projects</Button>}
                />
              </TableCell>
            </TableRow>
          ) : state === "loading" ? (
            [0, 1, 2].map((row) => (
              <TableRow key={row}>
                {[0, 1, 2].map((cell) => (
                  <TableCell key={cell}>
                    <Skeleton className="h-4 w-28" aria-hidden="true" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            projects.map((project) => (
              <TableRow key={project.name}>
                <TableHead
                  scope="row"
                  className={longValues ? "whitespace-nowrap text-foreground" : "text-foreground"}
                >
                  {longValues
                    ? `${project.name}: a shared workspace project with a descriptive title and extended ownership details`
                    : project.name}
                </TableHead>
                <TableCell className={longValues ? "whitespace-nowrap" : undefined}>
                  {project.owner}
                </TableCell>
                <TableCell>
                  <Badge variant={project.state === "Active" ? "secondary" : "outline"}>
                    {project.state}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  ),
} satisfies Meta<TableArgs>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Projects: Story = {};
export const Empty: Story = { args: { state: "empty" } };
export const Loading: Story = { args: { state: "loading" } };
export const Error: Story = { args: { state: "error" } };
export const LongValues: Story = { args: { longValues: true } };
