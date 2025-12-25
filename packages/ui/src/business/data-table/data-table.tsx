import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@raypx/ui/components";
import { Checkbox } from "@raypx/ui/components/checkbox";
import { IconArrowDown, IconArrowUp, IconArrowUpDown } from "@tabler/icons-react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";

interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData>[];
  enableSelection?: boolean;
  onSelectionChange?: (selectedRows: TData[]) => void;
  getRowId?: (row: TData) => string;
  enableSorting?: boolean;
  manualSorting?: boolean;
  onSortingChange?: (sorting: { id: string; desc: boolean } | null) => void;
  initialSorting?: { id: string; desc: boolean };
  isLoading?: boolean;
  skeletonRows?: number;
}

export function DataTable<TData>({
  data,
  columns,
  enableSelection = false,
  onSelectionChange,
  getRowId: customGetRowId,
  enableSorting = false,
  manualSorting = false,
  onSortingChange,
  initialSorting,
  isLoading = false,
  skeletonRows = 5,
}: DataTableProps<TData>) {
  const getRowId = customGetRowId || ((row: TData) => (row as { id: string }).id);
  const [sorting, setSorting] = useState<SortingState>(
    initialSorting ? [{ id: initialSorting.id, desc: initialSorting.desc }] : [],
  );

  // Add selection column if enabled
  const columnsWithSelection = useMemo(() => {
    if (!enableSelection) return columns;

    const selectionColumn: ColumnDef<TData> = {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all"
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? ("indeterminate" as const)
                : false
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Select row"
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    };

    return [selectionColumn, ...columns];
  }, [columns, enableSelection]);

  // Add sortable header renderer if sorting is enabled
  const columnsWithSorting = useMemo(() => {
    if (!enableSorting) return columnsWithSelection;

    return columnsWithSelection.map((column) => {
      if (column.enableSorting === false || column.id === "select" || column.id === "actions") {
        return column;
      }

      const originalHeader = column.header;
      const columnId = column.id || ("accessorKey" in column ? column.accessorKey : undefined);
      return {
        ...column,
        header: ({ column: col }: { column: any }) => {
          const canSort = col.getCanSort();
          const sortDirection = col.getIsSorted();

          return (
            <button
              className="flex items-center gap-2 hover:text-foreground transition-colors disabled:cursor-default disabled:opacity-50"
              disabled={!canSort}
              onClick={col.getToggleSortingHandler()}
              type="button"
            >
              {typeof originalHeader === "function"
                ? originalHeader({ column: col } as any)
                : originalHeader || columnId || ""}
              {canSort && (
                <span className="ml-1">
                  {sortDirection === "asc" ? (
                    <IconArrowUp className="h-4 w-4" />
                  ) : sortDirection === "desc" ? (
                    <IconArrowDown className="h-4 w-4" />
                  ) : (
                    <IconArrowUpDown className="h-4 w-4 opacity-50" />
                  )}
                </span>
              )}
            </button>
          );
        },
      } as ColumnDef<TData>;
    });
  }, [columnsWithSelection, enableSorting]);

  const table = useReactTable({
    data,
    columns: columnsWithSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting && !manualSorting ? getSortedRowModel() : undefined,
    enableRowSelection: enableSelection,
    enableSorting,
    manualSorting,
    onSortingChange: (updater) => {
      const newSorting = typeof updater === "function" ? updater(sorting) : updater;
      setSorting(newSorting);

      if (onSortingChange) {
        if (newSorting.length > 0) {
          const sort = newSorting[0];
          if (sort) {
            onSortingChange({ id: sort.id, desc: sort.desc });
          }
        } else {
          onSortingChange(null);
        }
      }
    },
    state: {
      sorting,
    },
    getRowId: enableSelection ? getRowId : undefined,
  });

  // Notify parent of selection changes
  useEffect(() => {
    if (enableSelection && onSelectionChange) {
      const selectedRows = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
      onSelectionChange(selectedRows);
    }
  }, [table.getState().rowSelection, enableSelection, onSelectionChange, table]);

  // Extract header text from column definitions for skeleton
  const getHeaderText = (column: ColumnDef<TData>): string => {
    if (typeof column.header === "string") {
      return column.header;
    }
    if (typeof column.header === "function") {
      // For function headers, try to get a fallback from id or accessorKey
      return column.id || ("accessorKey" in column ? String(column.accessorKey) : "") || "";
    }
    // Fallback to id or accessorKey
    return column.id || ("accessorKey" in column ? String(column.accessorKey) : "") || "";
  };

  const colSpan = enableSelection ? columnsWithSelection.length : columns.length;

  // Show skeleton when loading
  if (isLoading) {
    return (
      <div className="px-6 pb-2">
        <Table>
          <TableHeader>
            <TableRow>
              {columnsWithSelection.map((column, index) => (
                <TableHead
                  className={
                    column.id === "actions" ? "w-20" : column.id === "select" ? "w-12" : ""
                  }
                  key={index}
                >
                  {getHeaderText(column)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: skeletonRows }).map((_, index) => (
              <TableRow key={index}>
                {columnsWithSelection.map((_, colIndex) => (
                  <TableCell key={colIndex}>
                    <Skeleton className="h-5 w-32" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="px-6 pb-2 space-y-3">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  className={
                    header.id === "actions" ? "w-20" : header.id === "select" ? "w-12" : ""
                  }
                  key={header.id}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
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
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
