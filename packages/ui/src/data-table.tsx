import type { ReactTable, RowData, TableFeatures } from "@tanstack/react-table";
import { row_getVisibleCells } from "@tanstack/react-table/static-functions";
import type { ComponentProps } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./components/ui/table";

type ColumnPresentation = {
  header?: Pick<ComponentProps<typeof TableHead>, "className" | "aria-sort">;
  cellClassName?: string;
};

export function DataTable<TFeatures extends TableFeatures, TData extends RowData>({
  table,
  label,
  columnPresentation,
}: {
  table: ReactTable<TFeatures, TData, unknown>;
  label: string;
  columnPresentation?: Readonly<Record<string, ColumnPresentation>>;
}) {
  return (
    <Table aria-label={label}>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead
                key={header.id}
                colSpan={header.colSpan}
                scope={header.subHeaders.length ? "colgroup" : "col"}
                aria-hidden={header.isPlaceholder || undefined}
                {...columnPresentation?.[header.column.id]?.header}
              >
                {!header.isPlaceholder && <table.FlexRender header={header} />}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row_getVisibleCells(row).map((cell) => (
              <TableCell
                key={cell.id}
                className={columnPresentation?.[cell.column.id]?.cellClassName}
              >
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
