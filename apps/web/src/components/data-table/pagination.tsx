import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

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

  return (
    <div className="flex items-center justify-between px-6 py-4">
      <div className="text-muted-foreground flex-1 text-sm">
        {selectedCount > 0
          ? `${selectedCount} of ${total} row${total !== 1 ? "s" : ""} selected.`
          : `${total} row${total !== 1 ? "s" : ""} total`}
      </div>
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">Rows per page</p>
          <Select
            onValueChange={(value) => {
              onPageSizeChange(Number(value));
            }}
            value={`${pageSize}`}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={pageSize.toString()} />
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
        <div className="flex w-[100px] items-center justify-center text-sm font-medium">
          Page {page} of {totalPages}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            className="hidden size-8 lg:flex"
            disabled={!canPreviousPage}
            onClick={() => onPageChange(1)}
            size="icon"
            variant="outline"
          >
            <span className="sr-only">Go to first page</span>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            className="size-8"
            disabled={!canPreviousPage}
            onClick={() => onPageChange(page - 1)}
            size="icon"
            variant="outline"
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            className="size-8"
            disabled={!canNextPage}
            onClick={() => onPageChange(page + 1)}
            size="icon"
            variant="outline"
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            className="hidden size-8 lg:flex"
            disabled={!canNextPage}
            onClick={() => onPageChange(totalPages)}
            size="icon"
            variant="outline"
          >
            <span className="sr-only">Go to last page</span>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
