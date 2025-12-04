import {
  Checkbox,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@raypx/ui/components";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { EmptyComponent } from "./empty";
import { ErrorWithRetry } from "./error";
import { DataTablePagination } from "./pagination";
import { DataTableToolbar } from "./toolbar";
import type { EmptyProps, ErrorProps, PaginationProps, SearchProps } from "./types";
import { DataTableViewOptions } from "./view-options";

interface ServerDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  // Pagination
  pagination: PaginationProps;
  // Sorting
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  enableSorting?: boolean;
  manualSorting?: boolean;
  // Selection
  enableSelection?: boolean;
  selectedRows?: TData[];
  onSelectionChange?: (rows: TData[]) => void;
  getRowId?: (row: TData) => string;
  // Toolbar
  search?: SearchProps;
  filters?: Array<{
    title: string;
    options: Array<{
      label: string;
      value: string;
      icon?: React.ComponentType<{ className?: string }>;
    }>;
    selectedValues?: string[];
    onSelectedValuesChange?: (values: string[]) => void;
    counts?: Map<string, number>;
  }>;
  onResetFilters?: () => void;
  toolbarActions?: React.ReactNode;
  // View options
  enableColumnVisibility?: boolean;
  // Loading
  isLoading?: boolean;
  skeletonRows?: number;
  // Empty state
  empty?: EmptyProps;
  // Error state
  isError?: boolean;
  error?: ErrorProps;
}

export function ServerDataTable<TData, TValue>({
  columns,
  data,
  // Pagination
  pagination: paginationProps,
  // Sorting
  sorting: controlledSorting,
  onSortingChange,
  enableSorting = false,
  manualSorting = true,
  // Selection
  enableSelection = false,
  selectedRows = [],
  onSelectionChange,
  getRowId,
  // Toolbar
  search,
  filters,
  onResetFilters,
  toolbarActions,
  // View options
  enableColumnVisibility = false,
  // Loading
  isLoading = false,
  skeletonRows = 5,
  // Empty state
  empty,
  // Error state
  isError = false,
  error,
}: ServerDataTableProps<TData, TValue>) {
  const { message: emptyMessage = "No results.", component: emptyComponent = <EmptyComponent /> } =
    empty || {};
  const {
    message: errorMessage,
    component: errorComponent,
    onRetry,
    retrying = false,
  } = error || {};
  const {
    value: searchValue,
    onChange: onSearchChange,
    placeholder: searchPlaceholder = "Search...",
  } = search || {};
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const pagination = useMemo(
    () => ({
      ...paginationProps,
      pageSizeOptions: paginationProps.pageSizeOptions ?? [10, 20, 50, 100],
    }),
    [paginationProps],
  );

  const sorting = controlledSorting ?? internalSorting;
  const setSorting = onSortingChange ?? setInternalSorting;

  // Add selection column if enabled
  const columnsWithSelection = useMemo(() => {
    if (!enableSelection) return columns;

    const selectionColumn: ColumnDef<TData, TValue> = {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all"
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          className="translate-y-[2px]"
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Select row"
          checked={row.getIsSelected()}
          className="translate-y-[2px]"
          onCheckedChange={(value) => row.toggleSelected(!!value)}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    };

    return [selectionColumn, ...columns];
  }, [columns, enableSelection]);

  const table = useReactTable({
    data,
    columns: columnsWithSelection,
    state: {
      sorting,
      columnVisibility,
    },
    enableSorting,
    manualSorting,
    onSortingChange: setSorting as (
      updater: SortingState | ((old: SortingState) => SortingState),
    ) => void,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting && !manualSorting ? getSortedRowModel() : undefined,
    getRowId: enableSelection && getRowId ? getRowId : undefined,
    enableRowSelection: enableSelection,
  });

  // Handle selection changes
  useEffect(() => {
    if (enableSelection && onSelectionChange) {
      const selected = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
      onSelectionChange(selected);
    }
  }, [table.getState().rowSelection, enableSelection, onSelectionChange, table]);

  const colSpan = columnsWithSelection.length;

  // Show error state
  if (isError) {
    const errorDisplay = errorComponent || (
      <ErrorWithRetry message={errorMessage} onRetry={onRetry} retrying={retrying} />
    );
    return (
      <div className="flex flex-col gap-4">
        {(searchValue !== undefined || filters || toolbarActions) && (
          <DataTableToolbar
            actions={
              <>
                {enableColumnVisibility && <DataTableViewOptions table={table} />}
                {toolbarActions}
              </>
            }
            filters={filters}
            onReset={onResetFilters}
            search={{
              value: searchValue,
              onChange: onSearchChange,
              placeholder: searchPlaceholder,
            }}
          />
        )}
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="h-24 text-center" colSpan={colSpan}>
                  {errorDisplay}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  // Show skeleton when loading
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {searchValue !== undefined && (
          <DataTableToolbar
            actions={
              <>
                {enableColumnVisibility && <DataTableViewOptions table={table} />}
                {toolbarActions}
              </>
            }
            filters={filters}
            onReset={onResetFilters}
            search={{
              value: searchValue,
              onChange: onSearchChange,
              placeholder: searchPlaceholder,
            }}
          />
        )}
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {columnsWithSelection.map((_, index) => (
                  <TableHead key={index}>
                    <Skeleton className="h-4 w-[100px]" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {columnsWithSelection.map((_, colIndex) => (
                    <TableCell key={colIndex}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {(searchValue !== undefined || filters || toolbarActions) && (
        <DataTableToolbar
          actions={
            <>
              {enableColumnVisibility && <DataTableViewOptions table={table} />}
              {toolbarActions}
            </>
          }
          filters={filters}
          onReset={onResetFilters}
          search={{
            value: searchValue,
            onChange: onSearchChange,
            placeholder: searchPlaceholder,
          }}
        />
      )}
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead colSpan={header.colSpan} key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow data-state={row.getIsSelected() && "selected"} key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="h-24 text-center" colSpan={colSpan}>
                  {emptyComponent || emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {data.length > 0 && (
        <DataTablePagination {...pagination} selectedCount={selectedRows.length} />
      )}
    </div>
  );
}
