import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { useState, type ComponentProps, type MouseEvent } from "react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../../src/components/pagination.js";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../src/components/table.js";

type PaginationArgs = ComponentProps<typeof Pagination> & {
  initialPage: number;
  pageCount: number;
  withList: boolean;
};
const projectNames = [
  "Documentation",
  "Customer portal",
  "Usage reports",
  "Design library",
  "Release notes",
  "Workspace settings",
  "Team directory",
];
function ProjectPagination({ initialPage, pageCount, withList, ...args }: PaginationArgs) {
  const count = Math.min(10, Math.max(1, Math.trunc(pageCount) || 1));
  const [page, setPage] = useState(Math.min(count, Math.max(1, Math.trunc(initialPage) || 1)));
  const navigate = (next: number) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setPage(next);
  };
  return (
    <div className="grid w-full max-w-2xl gap-4">
      {withList && (
        <Table containerLabel="Paginated workspace projects">
          <TableCaption>Workspace projects on page {page}.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projectNames.slice((page - 1) * 3, page * 3).map((name) => (
              <TableRow key={name}>
                <TableHead scope="row" className="text-foreground">
                  {name}
                </TableHead>
                <TableCell>Active</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pagination {...args}>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href={`?page=${page - 1}`}
              disabled={page === 1}
              onClick={navigate(page - 1)}
            />
          </PaginationItem>
          {Array.from({ length: count }, (_, index) => index + 1).map((number) => (
            <PaginationItem key={number}>
              <PaginationLink
                href={`?page=${number}`}
                isActive={page === number}
                aria-label={`Page ${number}`}
                onClick={navigate(number)}
              >
                {number}
              </PaginationLink>
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext
              href={`?page=${page + 1}`}
              disabled={page === count}
              onClick={navigate(page + 1)}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
      <output aria-label="Page summary" className="text-center text-sm text-muted-foreground">
        Page {page} of {count}
      </output>
    </div>
  );
}
const meta = {
  title: "Primitives/Pagination",
  component: Pagination,
  args: { initialPage: 1, pageCount: 3, withList: false },
  argTypes: {
    initialPage: { control: { type: "number", min: 1, max: 10 } },
    pageCount: { control: { type: "number", min: 1, max: 10 } },
    withList: { control: false },
    children: { control: false },
  },
  render: (args) => <ProjectPagination key={`${args.initialPage}:${args.pageCount}`} {...args} />,
  parameters: {
    docs: {
      description: {
        component:
          "Pagination provides navigation semantics and disabled links. The consumer owns page totals, URL generation, page selection, and data loading. This example updates local data only.",
      },
    },
  },
} satisfies Meta<PaginationArgs>;
export default meta;
type Story = StoryObj<typeof meta>;
export const FirstPage: Story = {};
export const MiddlePage: Story = { args: { initialPage: 2 } };
export const LastPage: Story = { args: { initialPage: 3 } };
export const SinglePage: Story = { args: { pageCount: 1 } };
export const MorePages: Story = {
  render: () => (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#page-3" />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#page-1" aria-label="Page 1">
            1
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#page-4" aria-label="Page 4" isActive>
            4
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#page-20" aria-label="Page 20">
            20
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="#page-5" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  ),
};
export const ControlledList: Story = {
  args: { withList: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const previous = canvas.getByRole("link", { name: "Go to previous page" });
    await expect(previous).toHaveAttribute("aria-disabled", "true");
    await expect(previous).not.toHaveAttribute("href");
    await userEvent.click(previous);
    await expect(canvas.getByRole("status", { name: "Page summary" })).toHaveTextContent(
      "Page 1 of 3",
    );
    const next = canvas.getByRole("link", { name: "Go to next page" });
    await userEvent.click(next);
    await expect(
      canvas.getByRole("table", { name: "Workspace projects on page 2." }),
    ).toHaveTextContent("Design library");
    await expect(canvas.queryByText("Documentation")).not.toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Page 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await userEvent.click(next);
    await expect(canvas.getByRole("status", { name: "Page summary" })).toHaveTextContent(
      "Page 3 of 3",
    );
    await expect(next).toHaveAttribute("aria-disabled", "true");
    await expect(next).toHaveAttribute("tabindex", "-1");
    await expect(next).not.toHaveAttribute("href");
    await expect(
      canvas.getByRole("table", { name: "Workspace projects on page 3." }),
    ).toHaveTextContent("Team directory");
  },
};
