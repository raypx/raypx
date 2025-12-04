import { useMemo } from "react";

export type GridCols = {
  default?: number;
  md?: number;
  lg?: number;
  xl?: number;
};

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

export function useGridColsClass(gridCols: GridCols): string {
  return useMemo(() => {
    const cols: string[] = [];
    if (gridCols.default) cols.push(colMap[gridCols.default] || "grid-cols-1");
    if (gridCols.md) cols.push(mdColMap[gridCols.md] || "md:grid-cols-2");
    if (gridCols.lg) cols.push(lgColMap[gridCols.lg] || "lg:grid-cols-3");
    if (gridCols.xl) cols.push(xlColMap[gridCols.xl] || "xl:grid-cols-4");
    return cols.join(" ");
  }, [gridCols]);
}
