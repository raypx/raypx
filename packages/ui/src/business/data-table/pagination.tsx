import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from "@raypx/ui/components/pagination";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useMemo } from "react";

interface DataTablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  selectedCount?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

export function DataTablePagination({
  page,
  pageSize,
  total,
  selectedCount = 0,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: DataTablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPreviousPage = page > 1;
  const canNextPage = page < totalPages;

  const statusText = useMemo(() => {
    const rowText = total > 1 ? "rows" : "row";
    const totalText = `${total} ${rowText}`;
    return selectedCount > 0 ? `${selectedCount} of ${totalText} selected.` : `${totalText} total`;
  }, [selectedCount, total]);

  return (
    <div className="flex items-center justify-between px-6 py-4">
      <div className="text-muted-foreground flex-1 text-sm">{statusText}</div>
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-sm text-muted-foreground">Rows per page</span>
          <Select
            onValueChange={(value) => {
              onPageSizeChange(Number(value));
            }}
            value={`${pageSize}`}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={`${size}`}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-center text-sm text-muted-foreground">
          <span className="whitespace-nowrap">
            Page {page} of {totalPages}
          </span>
        </div>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationLink
                aria-label="Go to first page"
                className="hidden size-8 lg:flex border"
                disabled={!canPreviousPage}
                onClick={(e) => {
                  e.preventDefault();
                  if (canPreviousPage) onPageChange(1);
                }}
                size="icon"
              >
                <span className="sr-only">Go to first page</span>
                <ChevronsLeft className="h-4 w-4" />
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink
                aria-label="Go to previous page"
                className="size-8 border"
                disabled={!canPreviousPage}
                onClick={(e) => {
                  e.preventDefault();
                  if (canPreviousPage) onPageChange(page - 1);
                }}
                size="icon"
              >
                <span className="sr-only">Go to previous page</span>
                <ChevronLeft className="h-4 w-4" />
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink
                aria-label="Go to next page"
                className="size-8 border"
                disabled={!canNextPage}
                onClick={(e) => {
                  e.preventDefault();
                  if (canNextPage) onPageChange(page + 1);
                }}
                size="icon"
              >
                <span className="sr-only">Go to next page</span>
                <ChevronRight className="h-4 w-4" />
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink
                aria-label="Go to last page"
                className="hidden size-8 lg:flex border"
                disabled={!canNextPage}
                onClick={(e) => {
                  e.preventDefault();
                  if (canNextPage) onPageChange(totalPages);
                }}
                size="icon"
              >
                <span className="sr-only">Go to last page</span>
                <ChevronsRight className="h-4 w-4" />
              </PaginationLink>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
