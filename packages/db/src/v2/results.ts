/** Normalize Drizzle's returning/select arrays at the adapter boundary. */
export async function first<Row>(rows: PromiseLike<Row[]>): Promise<Row | null> {
  return (await rows)[0] ?? null;
}

export async function inserted<Row>(rows: PromiseLike<Row[]>, operation: string): Promise<Row> {
  const row = await first(rows);
  if (!row) throw new Error(`${operation} did not return a row.`);
  return row;
}
