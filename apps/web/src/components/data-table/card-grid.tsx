"use client";

import { Card, CardContent, CardHeader, Skeleton } from "@raypx/ui/components";
import * as React from "react";

import { DataTablePagination } from "./pagination";
import { DataTableToolbar } from "./toolbar";

interface ServerCardGridProps<TData> {
  data: TData[];
  // Card rendering
  renderCard: (item: TData, index: number) => React.ReactNode;
  getCardKey?: (item: TData) => string;
  // Grid layout
  gridCols?: {
    default?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  cardGap?: string;
  cardPadding?: string;
  // Pagination
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  // Selection
  enableSelection?: boolean;
  selectedRows?: TData[];
  onSelectionChange?: (rows: TData[]) => void;
  getRowId?: (row: TData) => string;
  // Toolbar
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
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
  // Loading
  isLoading?: boolean;
  skeletonRows?: number;
  renderSkeleton?: () => React.ReactNode;
  // Empty state
  emptyMessage?: string;
  emptyComponent?: React.ReactNode;
}

export function ServerCardGrid<TData>({
  data,
  renderCard,
  getCardKey,
  gridCols = { default: 1, md: 2, lg: 3 },
  cardGap = "gap-4",
  cardPadding = "p-6",
  // Pagination
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions,
  // Selection
  enableSelection = false,
  selectedRows = [],
  onSelectionChange,
  getRowId,
  // Toolbar
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters,
  onResetFilters,
  toolbarActions,
  // Loading
  isLoading = false,
  skeletonRows = 6,
  renderSkeleton,
  // Empty state
  emptyMessage = "No results.",
  emptyComponent,
}: ServerCardGridProps<TData>) {
  const gridColsClass = React.useMemo(() => {
    const cols: string[] = [];
    // Use explicit class names for Tailwind CSS to work properly
    const colMap: Record<number, string> = {
      1: "grid-cols-1",
      2: "grid-cols-2",
      3: "grid-cols-3",
      4: "grid-cols-4",
      5: "grid-cols-5",
      6: "grid-cols-6",
    };
    const mdColMap: Record<number, string> = {
      1: "md:grid-cols-1",
      2: "md:grid-cols-2",
      3: "md:grid-cols-3",
      4: "md:grid-cols-4",
      5: "md:grid-cols-5",
      6: "md:grid-cols-6",
    };
    const lgColMap: Record<number, string> = {
      1: "lg:grid-cols-1",
      2: "lg:grid-cols-2",
      3: "lg:grid-cols-3",
      4: "lg:grid-cols-4",
      5: "lg:grid-cols-5",
      6: "lg:grid-cols-6",
    };
    const xlColMap: Record<number, string> = {
      1: "xl:grid-cols-1",
      2: "xl:grid-cols-2",
      3: "xl:grid-cols-3",
      4: "xl:grid-cols-4",
      5: "xl:grid-cols-5",
      6: "xl:grid-cols-6",
    };
    if (gridCols.default) cols.push(colMap[gridCols.default] || "grid-cols-1");
    if (gridCols.md) cols.push(mdColMap[gridCols.md] || "md:grid-cols-2");
    if (gridCols.lg) cols.push(lgColMap[gridCols.lg] || "lg:grid-cols-3");
    if (gridCols.xl) cols.push(xlColMap[gridCols.xl] || "xl:grid-cols-4");
    return cols.join(" ");
  }, [gridCols]);

  // Show skeleton when loading
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {(searchValue !== undefined || filters || toolbarActions) && (
          <DataTableToolbar
            actions={toolbarActions}
            filters={filters}
            onReset={onResetFilters}
            onSearchChange={onSearchChange}
            searchPlaceholder={searchPlaceholder}
            searchValue={searchValue}
          />
        )}
        <div className={`grid ${gridColsClass} ${cardGap} ${cardPadding}`}>
          {renderSkeleton
            ? Array.from({ length: skeletonRows }).map((_, index) => (
                <React.Fragment key={index}>{renderSkeleton()}</React.Fragment>
              ))
            : Array.from({ length: skeletonRows }).map((_, index) => (
                <Card key={index}>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-full mt-2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3 mt-2" />
                  </CardContent>
                </Card>
              ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {(searchValue !== undefined || filters || toolbarActions) && (
        <DataTableToolbar
          actions={toolbarActions}
          filters={filters}
          onReset={onResetFilters}
          onSearchChange={onSearchChange}
          searchPlaceholder={searchPlaceholder}
          searchValue={searchValue}
        />
      )}
      {data.length > 0 ? (
        <>
          <div className={`grid ${gridColsClass} ${cardGap} ${cardPadding}`}>
            {data.map((item, index) => {
              const key = getCardKey ? getCardKey(item) : (item as any).id || index;
              return <React.Fragment key={key}>{renderCard(item, index)}</React.Fragment>;
            })}
          </div>
          <DataTablePagination
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            page={page}
            pageSize={pageSize}
            pageSizeOptions={pageSizeOptions}
            selectedCount={selectedRows.length}
            total={total}
          />
        </>
      ) : (
        <div className="flex items-center justify-center min-h-[200px]">
          {emptyComponent || <div className="text-muted-foreground">{emptyMessage}</div>}
        </div>
      )}
    </div>
  );
}
