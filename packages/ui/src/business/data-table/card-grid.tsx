"use client";

import { Card, CardContent, CardHeader, Skeleton } from "@raypx/ui/components";
import * as React from "react";
import { useMemo } from "react";
import { EmptyComponent } from "./empty";
import { ErrorWithRetry } from "./error";
import { type GridCols, useGridColsClass } from "./grid-cols";
import { DataTablePagination } from "./pagination";
import { DataTableToolbar } from "./toolbar";
import type { EmptyProps, ErrorProps, PaginationProps, SearchProps } from "./types";

interface ServerCardGridProps<TData> {
  data: TData[];
  // Card rendering
  renderCard: (item: TData, index: number) => React.ReactNode;
  getRowId?: (item: TData) => string;
  // Grid layout
  gridCols?: GridCols;
  cardGap?: string;
  cardPadding?: string;
  // Pagination
  pagination: PaginationProps;
  // Selection
  enableSelection?: boolean;
  selectedRows?: TData[];
  onSelectionChange?: (rows: TData[]) => void;
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
  // Loading
  isLoading?: boolean;
  skeletonRows?: number;
  renderSkeleton?: () => React.ReactNode;
  // Empty state
  empty?: EmptyProps;
  // Error state
  isError?: boolean;
  error?: ErrorProps;
}

export function ServerCardGrid<TData>({
  data,
  renderCard,
  getRowId = (item: TData) => (item as any).id || "",
  gridCols = { default: 1, md: 2, lg: 3 },
  cardGap = "gap-4",
  cardPadding = "p-6",
  // Pagination
  pagination: paginationProps,
  // Selection
  enableSelection: _enableSelection = false,
  selectedRows = [],
  onSelectionChange: _onSelectionChange,
  // Toolbar
  search,
  filters,
  onResetFilters,
  toolbarActions,
  // Loading
  isLoading = false,
  skeletonRows = 6,
  renderSkeleton,
  // Empty state
  empty,
  // Error state
  isError = false,
  error,
}: ServerCardGridProps<TData>) {
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

  const pagination = useMemo(
    () => ({
      ...paginationProps,
      pageSizeOptions: paginationProps.pageSizeOptions ?? [12, 24, 48, 96],
    }),
    [paginationProps],
  );

  const gridColsClass = useGridColsClass(gridCols);

  // Show error state
  if (isError) {
    const errorDisplay = errorComponent || (
      <ErrorWithRetry message={errorMessage} onRetry={onRetry} retrying={retrying} />
    );
    return (
      <div className="flex flex-col gap-4">
        {(searchValue !== undefined || filters || toolbarActions) && (
          <DataTableToolbar
            actions={toolbarActions}
            filters={filters}
            onReset={onResetFilters}
            search={{
              value: searchValue,
              onChange: onSearchChange,
              placeholder: searchPlaceholder,
            }}
          />
        )}
        <div className="flex items-center justify-center min-h-[200px]">{errorDisplay}</div>
      </div>
    );
  }

  // Show skeleton when loading
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {(searchValue !== undefined || filters || toolbarActions) && (
          <DataTableToolbar
            actions={toolbarActions}
            filters={filters}
            onReset={onResetFilters}
            search={{
              value: searchValue,
              onChange: onSearchChange,
              placeholder: searchPlaceholder,
            }}
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
          search={{
            value: searchValue,
            onChange: onSearchChange,
            placeholder: searchPlaceholder,
          }}
        />
      )}
      {data.length > 0 ? (
        <>
          <div className={`grid ${gridColsClass} ${cardGap} ${cardPadding}`}>
            {data.map((item, index) => {
              const key = getRowId(item) || String(index);
              return <React.Fragment key={key}>{renderCard(item, index)}</React.Fragment>;
            })}
          </div>
          <DataTablePagination {...pagination} selectedCount={selectedRows.length} />
        </>
      ) : (
        <div className="flex items-center justify-center min-h-[200px]">
          {emptyComponent || <div className="text-muted-foreground">{emptyMessage}</div>}
        </div>
      )}
    </div>
  );
}
